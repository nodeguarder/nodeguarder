package ebpf


import (
    "bytes"
    "encoding/binary"
	"log"
    "errors"

	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/perf"
	"github.com/cilium/ebpf/rlimit"
)

// Loader handles BPF program lifecycle
type Loader struct {
	objs   BpfObjects
	linkFork link.Link
	linkExit link.Link
	rd     *perf.Reader
    EventHandler EventHandler
}

// InitBPF loads the BPF programs and maps
func InitBPF() (*Loader, error) {
	// Allow the current process to lock memory for eBPF resources.
	if err := rlimit.RemoveMemlock(); err != nil {
		return nil, err
	}

	// Load pre-compiled programs and maps into the kernel.
	objs := BpfObjects{}
	if err := LoadBpfObjects(&objs, nil); err != nil {
		return nil, err
	}

	l := &Loader{objs: objs}

	// Attach Tracepoint: sched_process_fork
	tpFork, err := link.Tracepoint("sched", "sched_process_fork", objs.HandleFork, nil)
	if err != nil {
		l.Close()
		return nil, err
	}
	l.linkFork = tpFork

	// Attach Tracepoint: sched_process_exit
	tpExit, err := link.Tracepoint("sched", "sched_process_exit", objs.HandleExit, nil)
	if err != nil {
		l.Close()
		return nil, err
	}
	l.linkExit = tpExit

	// Open Perf Event Reader
	rd, err := perf.NewReader(objs.Events, 4096)
	if err != nil {
		l.Close()
		return nil, err
	}
	l.rd = rd

	log.Println("✅ eBPF Probes Loaded (fork/exit)")
    
    // Start listening in background
    go l.listen()

	return l, nil
}

func (l *Loader) Close() {
	if l.rd != nil {
		l.rd.Close()
	}
	if l.linkFork != nil {
		l.linkFork.Close()
	}
	if l.linkExit != nil {
		l.linkExit.Close()
	}
	l.objs.Close()
}


// ProcessExitEvent represents a process exit event captured by eBPF
type ProcessExitEvent struct {
    Pid      uint32
    ParentPid uint32
    NsPid    uint32
    NsParentPid uint32
    ExitCode int32
    Comm     [16]byte
}

func (l *Loader) listen() {
    // Reusing the struct definition matching C code layout
	var event struct {
		Pid      uint32
        ParentPid uint32
        NsPid    uint32
        NsParentPid uint32
		ExitCode int32
		Comm     [16]byte
	}
	
	for {
		record, err := l.rd.Read()
		if err != nil {
			if errors.Is(err, perf.ErrClosed) {
				return
			}
			log.Printf("reading from perf event reader: %s", err)
			continue
		}

		if record.LostSamples != 0 {
			log.Printf("perf event ring buffer full, dropped %d samples", record.LostSamples)
			continue
		}

        // Deserialize event
        if err := binary.Read(bytes.NewReader(record.RawSample), binary.LittleEndian, &event); err != nil {
            log.Printf("Failed to decode BPF event: %v", err)
            continue
        }
        
        // Send to callback
        if l.EventHandler != nil {
            l.EventHandler(ProcessExitEvent{
                Pid:      event.Pid,
                ParentPid: event.ParentPid,
                NsPid:    event.NsPid,
                NsParentPid: event.NsParentPid,
                ExitCode: event.ExitCode,
                Comm:     event.Comm,
            })
        }
	}
}

// EventHandler callback type
type EventHandler func(ProcessExitEvent)

// SetEventHandler registers a callback for BPF events
func (l *Loader) SetEventHandler(handler EventHandler) {
    l.EventHandler = handler
}


