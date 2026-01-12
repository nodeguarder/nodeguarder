#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_core_read.h>

char __license[] SEC("license") = "Dual MIT/GPL";

// Struct definitions for Tracepoints
struct trace_event_raw_sched_process_fork {
	short type;
	unsigned char flags;
	unsigned char preempt_count;
	int pid; // common_pid, not the pid we want
    // offset 8
	char parent_comm[16];
	pid_t parent_pid;
	char child_comm[16];
	pid_t child_pid;
};

// We don't use sched_process_template for exit code anymore
struct trace_event_raw_sched_process_template {
	short type;
	unsigned char flags;
	unsigned char preempt_count;
	int pid;
};

struct event {
	u32 pid;
    u32 parent_pid;
    u32 ns_pid;
    u32 ns_parent_pid;
	int exit_code;
	u8 comm[16];
};

struct {
	__uint(type, BPF_MAP_TYPE_HASH);
	__uint(max_entries, 10240);
	__type(key, u32);
	__type(value, u8);
} monitored_pids SEC(".maps");

struct {
	__uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
	__uint(key_size, sizeof(u32));
	__uint(value_size, sizeof(u32));
} events SEC(".maps");

SEC("tracepoint/sched/sched_process_fork")
int handle_fork(struct trace_event_raw_sched_process_fork *ctx) {
    // Check key parent names
    char parent_comm[16];
    bpf_get_current_comm(&parent_comm, sizeof(parent_comm));
    
    // Check if parent is "CRON" or "cron" or "crond"
    if ((parent_comm[0] == 'c' && parent_comm[1] == 'r' && parent_comm[2] == 'o' && parent_comm[3] == 'n') ||
        (parent_comm[0] == 'C' && parent_comm[1] == 'R' && parent_comm[2] == 'O' && parent_comm[3] == 'N') ||
        (parent_comm[0] == 'c' && parent_comm[1] == 'r' && parent_comm[2] == 'o' && parent_comm[3] == 'n' && parent_comm[4] == 'd')) {
        
        u32 child_pid = ctx->child_pid;
        u8 val = 1;
        bpf_map_update_elem(&monitored_pids, &child_pid, &val, BPF_ANY);
    }
    return 0;
}

static __always_inline u32 get_task_ns_pid(struct task_struct *task) {
    struct pid *pid_struct = BPF_CORE_READ(task, thread_pid);
    unsigned int level = BPF_CORE_READ(pid_struct, level);
    
    if (level > 0 && level < 8) {
        return BPF_CORE_READ(pid_struct, numbers[level].nr);
    }
    return BPF_CORE_READ(pid_struct, numbers[0].nr);
}


SEC("tracepoint/sched/sched_process_exit")
int handle_exit(struct trace_event_raw_sched_process_template *ctx) {
    u32 pid = bpf_get_current_pid_tgid() >> 32;
    u8 *exists = bpf_map_lookup_elem(&monitored_pids, &pid);

    if (exists) {
        struct event evt = {};
        evt.pid = pid;
        bpf_get_current_comm(&evt.comm, sizeof(evt.comm));
        
        // Read exit_code from task_struct
        struct task_struct *task = (struct task_struct *)bpf_get_current_task();
        int exit_code;
        
        // Use BPF_CORE_READ to safely read the field regardless of kernel version
        exit_code = BPF_CORE_READ(task, exit_code);
        
        // Capture Parent PID (Global)
        evt.parent_pid = BPF_CORE_READ(task, real_parent, pid);
        
        // Capture Namespace PIDs
        evt.ns_pid = get_task_ns_pid(task);
        
        struct task_struct *parent_task = BPF_CORE_READ(task, real_parent);
        if (parent_task) {
            evt.ns_parent_pid = get_task_ns_pid(parent_task);
        } else {
             evt.ns_parent_pid = 0;
        }

        
        // exit_code is (status << 8) | signal
        evt.exit_code = (exit_code >> 8) & 0xFF;
        if ((exit_code & 0x7F) != 0) {
             evt.exit_code = 128 + (exit_code & 0x7F);
        }

        bpf_perf_event_output(ctx, &events, BPF_F_CURRENT_CPU, &evt, sizeof(evt));
        bpf_map_delete_elem(&monitored_pids, &pid);
    }
    return 0;
}
