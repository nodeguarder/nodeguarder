package queue

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// QueuedItem represents a single queued metrics/events payload
type QueuedItem struct {
	ID        int64     `json:"id"`
	Type      string    `json:"type"` // "metrics" or "events"
	Payload   string    `json:"payload"`
	Timestamp int64     `json:"timestamp"`
	Retries   int       `json:"retries"`
	LastError string    `json:"last_error,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// Queue manages local resilience queue for offline operation
type Queue struct {
	db              *sql.DB
	mu              sync.Mutex
	maxSize         int
	retryBackoff    map[int]int // retry count -> backoff seconds
	flushInterval   time.Duration
	lastFlushTime   time.Time
	isConnected     bool
	connCheckTicker *time.Ticker
}

// NewQueue creates a new resilience queue
func NewQueue(dbPath string, maxSize int) (*Queue, error) {
	// Ensure directory exists
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create queue directory: %w", err)
	}

	// Open or create database
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open queue database: %w", err)
	}

	// Set connection pool settings for reliability
	db.SetMaxOpenConns(1) // Single connection to avoid locks
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to connect to queue database: %w", err)
	}

	q := &Queue{
		db:            db,
		maxSize:       maxSize,
		flushInterval: 30 * time.Second,
		lastFlushTime: time.Now(),
		isConnected:   true,
		retryBackoff: map[int]int{
			0: 5,   // First retry: 5s
			1: 10,  // Second retry: 10s
			2: 20,  // Third retry: 20s
			3: 30,  // Fourth retry: 30s
			4: 45,  // Fifth retry: 45s
			5: 60,  // Sixth+ retry: 60s (max backoff)
		},
	}

	// Initialize database schema
	if err := q.initSchema(); err != nil {
		return nil, fmt.Errorf("failed to initialize queue schema: %w", err)
	}

	log.Printf("✓ Queue initialized at %s (max size: %d)", dbPath, maxSize)

	return q, nil
}

// initSchema creates the queue table if it doesn't exist
func (q *Queue) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS queue (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		type TEXT NOT NULL,
		payload TEXT NOT NULL,
		timestamp INTEGER NOT NULL,
		retries INTEGER DEFAULT 0,
		last_error TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_created_at ON queue(created_at);
	`

	_, err := q.db.Exec(schema)
	return err
}

// PushMetrics adds metrics to the queue
func (q *Queue) PushMetrics(payload map[string]interface{}) error {
	q.mu.Lock()
	defer q.mu.Unlock()

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal metrics: %w", err)
	}

	return q.pushItem("metrics", string(payloadJSON), time.Now().Unix())
}

// PushEvents adds events to the queue
func (q *Queue) PushEvents(payload []interface{}) error {
	q.mu.Lock()
	defer q.mu.Unlock()

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal events: %w", err)
	}

	return q.pushItem("events", string(payloadJSON), time.Now().Unix())
}

// pushItem adds a single item to the queue
func (q *Queue) pushItem(itemType, payload string, timestamp int64) error {
	// Check queue size and drop oldest if needed
	if err := q.enforceMaxSize(); err != nil {
		log.Printf("Warning: Failed to enforce max queue size: %v", err)
	}

	// Insert new item
	stmt := `INSERT INTO queue (type, payload, timestamp, retries, created_at)
	         VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)`

	result, err := q.db.Exec(stmt, itemType, payload, timestamp)
	if err != nil {
		return fmt.Errorf("failed to insert queue item: %w", err)
	}

	id, _ := result.LastInsertId()
	log.Printf("Queued %s (ID: %d, queue size will be checked)", itemType, id)

	return nil
}

// enforceMaxSize removes oldest items if queue exceeds max size
func (q *Queue) enforceMaxSize() error {
	// Get current queue size
	var count int
	err := q.db.QueryRow("SELECT COUNT(*) FROM queue").Scan(&count)
	if err != nil {
		return err
	}

	if count > q.maxSize {
		toDelete := count - q.maxSize
		log.Printf("Queue size (%d) exceeds max (%d), deleting %d oldest items",
			count, q.maxSize, toDelete)

		// Delete oldest items
		stmt := `DELETE FROM queue WHERE id IN (
			SELECT id FROM queue ORDER BY created_at ASC LIMIT ?
		)`
		_, err := q.db.Exec(stmt, toDelete)
		return err
	}

	return nil
}

// GetPending returns queued items ready for retry
func (q *Queue) GetPending() ([]QueuedItem, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	now := time.Now().Unix()
	var items []QueuedItem

	// Get items that are ready for retry based on backoff
	rows, err := q.db.Query(`
		SELECT id, type, payload, timestamp, retries, last_error, created_at
		FROM queue
		ORDER BY created_at ASC
		LIMIT 100
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query queue: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var item QueuedItem
		var createdAtStr string

		err := rows.Scan(&item.ID, &item.Type, &item.Payload, &item.Timestamp,
			&item.Retries, &item.LastError, &createdAtStr)
		if err != nil {
			return nil, fmt.Errorf("failed to scan queue item: %w", err)
		}

		item.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAtStr)

		// Check if item is ready for retry based on backoff
		backoff := q.getBackoffSeconds(item.Retries)
		ageSecs := now - item.CreatedAt.Unix()

		if item.Retries == 0 || ageSecs >= int64(backoff) {
			items = append(items, item)
		}
	}

	return items, rows.Err()
}

// MarkSent removes an item from the queue (successful push)
func (q *Queue) MarkSent(id int64) error {
	q.mu.Lock()
	defer q.mu.Unlock()

	stmt := "DELETE FROM queue WHERE id = ?"
	_, err := q.db.Exec(stmt, id)
	if err != nil {
		return fmt.Errorf("failed to delete queue item %d: %w", id, err)
	}

	return nil
}

// MarkFailed increments retry count and updates last error
func (q *Queue) MarkFailed(id int64, errMsg string) error {
	q.mu.Lock()
	defer q.mu.Unlock()

	stmt := "UPDATE queue SET retries = retries + 1, last_error = ? WHERE id = ?"
	_, err := q.db.Exec(stmt, errMsg, id)
	if err != nil {
		return fmt.Errorf("failed to update queue item %d: %w", id, err)
	}

	return nil
}

// GetBackoffSeconds returns the backoff duration in seconds for a retry count
func (q *Queue) getBackoffSeconds(retryCount int) int {
	if backoff, exists := q.retryBackoff[retryCount]; exists {
		return backoff
	}
	// Return max backoff if retry count exceeds map
	return 60
}

// GetSize returns current queue size
func (q *Queue) GetSize() (int, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	var count int
	err := q.db.QueryRow("SELECT COUNT(*) FROM queue").Scan(&count)
	return count, err
}

// GetStats returns queue statistics
func (q *Queue) GetStats() (map[string]interface{}, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	stats := make(map[string]interface{})

	// Total items
	var total int
	q.db.QueryRow("SELECT COUNT(*) FROM queue").Scan(&total)
	stats["total"] = total

	// Items by type
	rows, err := q.db.Query("SELECT type, COUNT(*) FROM queue GROUP BY type")
	if err == nil {
		typeCount := make(map[string]int)
		for rows.Next() {
			var t string
			var c int
			rows.Scan(&t, &c)
			typeCount[t] = c
		}
		rows.Close()
		stats["by_type"] = typeCount
	}

	// Retry distribution
	rows, err = q.db.Query("SELECT retries, COUNT(*) FROM queue GROUP BY retries ORDER BY retries")
	if err == nil {
		retryCount := make(map[string]int)
		for rows.Next() {
			var r int
			var c int
			rows.Scan(&r, &c)
			retryCount[fmt.Sprintf("retry_%d", r)] = c
		}
		rows.Close()
		stats["by_retries"] = retryCount
	}

	// Oldest item age
	var oldestAge sql.NullInt64
	q.db.QueryRow(`
		SELECT (strftime('%s', 'now') - strftime('%s', created_at))
		FROM queue ORDER BY created_at ASC LIMIT 1
	`).Scan(&oldestAge)
	if oldestAge.Valid {
		stats["oldest_age_seconds"] = oldestAge.Int64
	}

	stats["connected"] = q.isConnected

	return stats, nil
}

// SetConnected updates connection status
func (q *Queue) SetConnected(connected bool) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.isConnected != connected {
		if connected {
			log.Println("✓ Dashboard reconnected, queue will flush")
		} else {
			log.Println("⚠️  Dashboard disconnected, switching to queue mode")
		}
		q.isConnected = connected
	}
}

// IsConnected returns current connection status
func (q *Queue) IsConnected() bool {
	q.mu.Lock()
	defer q.mu.Unlock()

	return q.isConnected
}

// Close closes the database connection
func (q *Queue) Close() error {
	q.mu.Lock()
	defer q.mu.Unlock()

	return q.db.Close()
}
