package ebpf

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -target bpfel Bpf cron_exit.c -- -I/usr/include/ -I.
