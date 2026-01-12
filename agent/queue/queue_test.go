package queue

import (
	"os"
	"testing"
	"time"
)

func TestQueueCreation(t *testing.T) {
	// Create temp db
	tempFile := "/tmp/test_queue.db"
	os.Remove(tempFile)
	defer os.Remove(tempFile)

	q, err := NewQueue(tempFile, 100)
	if err != nil {
		t.Fatalf("Failed to create queue: %v", err)
	}
	defer q.Close()

	if q.maxSize != 100 {
		t.Errorf("Expected max size 100, got %d", q.maxSize)
	}
}

func TestPushMetrics(t *testing.T) {
	tempFile := "/tmp/test_queue_metrics.db"
	os.Remove(tempFile)
	defer os.Remove(tempFile)

	q, err := NewQueue(tempFile, 100)
	if err != nil {
		t.Fatalf("Failed to create queue: %v", err)
	}
	defer q.Close()

	metrics := map[string]interface{}{
		"cpu_percent": 45.2,
		"mem_used_mb": 1024,
	}

	err = q.PushMetrics(metrics)
	if err != nil {
		t.Fatalf("Failed to push metrics: %v", err)
	}

	// Verify item was queued
	items, err := q.GetPending()
	if err != nil {
		t.Fatalf("Failed to get pending items: %v", err)
	}

	if len(items) != 1 {
		t.Errorf("Expected 1 item, got %d", len(items))
	}

	if items[0].Type != "metrics" {
		t.Errorf("Expected type 'metrics', got %s", items[0].Type)
	}
}

func TestPushEvents(t *testing.T) {
	tempFile := "/tmp/test_queue_events.db"
	os.Remove(tempFile)
	defer os.Remove(tempFile)

	q, err := NewQueue(tempFile, 100)
	if err != nil {
		t.Fatalf("Failed to create queue: %v", err)
	}
	defer q.Close()

	events := []interface{}{
		map[string]interface{}{
			"type":    "cron",
			"message": "Failed cron job",
		},
	}

	err = q.PushEvents(events)
	if err != nil {
		t.Fatalf("Failed to push events: %v", err)
	}

	// Verify item was queued
	items, err := q.GetPending()
	if err != nil {
		t.Fatalf("Failed to get pending items: %v", err)
	}

	if len(items) != 1 {
		t.Errorf("Expected 1 item, got %d", len(items))
	}

	if items[0].Type != "events" {
		t.Errorf("Expected type 'events', got %s", items[0].Type)
	}
}

func TestMarkSent(t *testing.T) {
	tempFile := "/tmp/test_queue_mark_sent.db"
	os.Remove(tempFile)
	defer os.Remove(tempFile)

	q, err := NewQueue(tempFile, 100)
	if err != nil {
		t.Fatalf("Failed to create queue: %v", err)
	}
	defer q.Close()

	// Push and mark sent
	metrics := map[string]interface{}{"cpu": 50}
	q.PushMetrics(metrics)

	items, _ := q.GetPending()
	if len(items) == 0 {
		t.Fatal("No items in queue")
	}

	itemID := items[0].ID
	err = q.MarkSent(itemID)
	if err != nil {
		t.Fatalf("Failed to mark sent: %v", err)
	}

	// Verify item was removed
	items, _ = q.GetPending()
	if len(items) != 0 {
		t.Errorf("Expected 0 items after MarkSent, got %d", len(items))
	}
}

func TestMarkFailed(t *testing.T) {
	tempFile := "/tmp/test_queue_mark_failed.db"
	os.Remove(tempFile)
	defer os.Remove(tempFile)

	q, err := NewQueue(tempFile, 100)
	if err != nil {
		t.Fatalf("Failed to create queue: %v", err)
	}
	defer q.Close()

	// Push item and mark failed
	metrics := map[string]interface{}{"cpu": 50}
	q.PushMetrics(metrics)

	items, _ := q.GetPending()
	itemID := items[0].ID

	err = q.MarkFailed(itemID, "connection timeout")
	if err != nil {
		t.Fatalf("Failed to mark failed: %v", err)
	}

	// Verify retry count increased
	items, _ = q.GetPending()
	if items[0].Retries != 1 {
		t.Errorf("Expected retries=1, got %d", items[0].Retries)
	}

	if items[0].LastError != "connection timeout" {
		t.Errorf("Expected error message 'connection timeout', got %s", items[0].LastError)
	}
}

func TestBackoffCalculation(t *testing.T) {
	tempFile := "/tmp/test_queue_backoff.db"
	os.Remove(tempFile)
	defer os.Remove(tempFile)

	q, err := NewQueue(tempFile, 100)
	if err != nil {
		t.Fatalf("Failed to create queue: %v", err)
	}
	defer q.Close()

	tests := []struct {
		retryCount int
		expected   int
	}{
		{0, 5},
		{1, 10},
		{2, 20},
		{3, 30},
		{4, 45},
		{5, 60},
		{6, 60}, // Should cap at 60
	}

	for _, test := range tests {
		backoff := q.getBackoffSeconds(test.retryCount)
		if backoff != test.expected {
			t.Errorf("Retry %d: expected %ds, got %ds",
				test.retryCount, test.expected, backoff)
		}
	}
}

func TestMaxSizeEnforcement(t *testing.T) {
	tempFile := "/tmp/test_queue_max_size.db"
	os.Remove(tempFile)
	defer os.Remove(tempFile)

	maxSize := 5
	q, err := NewQueue(tempFile, maxSize)
	if err != nil {
		t.Fatalf("Failed to create queue: %v", err)
	}
	defer q.Close()

	// Push more items than max size
	for i := 0; i < 10; i++ {
		metrics := map[string]interface{}{"id": i}
		q.PushMetrics(metrics)
	}

	// Check size is enforced
	size, err := q.GetSize()
	if err != nil {
		t.Fatalf("Failed to get queue size: %v", err)
	}

	if size > maxSize {
		t.Errorf("Queue size %d exceeds max %d", size, maxSize)
	}
}

func TestQueueStats(t *testing.T) {
	tempFile := "/tmp/test_queue_stats.db"
	os.Remove(tempFile)
	defer os.Remove(tempFile)

	q, err := NewQueue(tempFile, 100)
	if err != nil {
		t.Fatalf("Failed to create queue: %v", err)
	}
	defer q.Close()

	// Push various items
	q.PushMetrics(map[string]interface{}{"cpu": 50})
	q.PushEvents([]interface{}{map[string]string{"type": "cron"}})
	q.PushMetrics(map[string]interface{}{"cpu": 60})

	// Get stats
	stats, err := q.GetStats()
	if err != nil {
		t.Fatalf("Failed to get stats: %v", err)
	}

	if stats["total"] != 3 {
		t.Errorf("Expected total=3, got %v", stats["total"])
	}

	byType := stats["by_type"].(map[string]int)
	if byType["metrics"] != 2 {
		t.Errorf("Expected 2 metrics items, got %d", byType["metrics"])
	}
	if byType["events"] != 1 {
		t.Errorf("Expected 1 events item, got %d", byType["events"])
	}
}

func TestConnectionStatus(t *testing.T) {
	tempFile := "/tmp/test_queue_conn.db"
	os.Remove(tempFile)
	defer os.Remove(tempFile)

	q, err := NewQueue(tempFile, 100)
	if err != nil {
		t.Fatalf("Failed to create queue: %v", err)
	}
	defer q.Close()

	if !q.IsConnected() {
		t.Errorf("Expected initial connected state to be true")
	}

	q.SetConnected(false)
	if q.IsConnected() {
		t.Errorf("Expected connected state to be false after SetConnected(false)")
	}

	q.SetConnected(true)
	if !q.IsConnected() {
		t.Errorf("Expected connected state to be true after SetConnected(true)")
	}
}

func TestGetPendingOrdering(t *testing.T) {
	tempFile := "/tmp/test_queue_ordering.db"
	os.Remove(tempFile)
	defer os.Remove(tempFile)

	q, err := NewQueue(tempFile, 100)
	if err != nil {
		t.Fatalf("Failed to create queue: %v", err)
	}
	defer q.Close()

	// Push items with slight delays
	q.PushMetrics(map[string]interface{}{"id": 1})
	time.Sleep(10 * time.Millisecond)
	q.PushMetrics(map[string]interface{}{"id": 2})
	time.Sleep(10 * time.Millisecond)
	q.PushMetrics(map[string]interface{}{"id": 3})

	// Get pending items
	items, err := q.GetPending()
	if err != nil {
		t.Fatalf("Failed to get pending: %v", err)
	}

	if len(items) < 3 {
		t.Fatalf("Expected at least 3 items, got %d", len(items))
	}

	// Verify they're ordered by created_at (oldest first)
	for i := 0; i < len(items)-1; i++ {
		if items[i].CreatedAt.After(items[i+1].CreatedAt) {
			t.Errorf("Items not ordered correctly: %v > %v",
				items[i].CreatedAt, items[i+1].CreatedAt)
		}
	}
}
