package api

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
    "mime/multipart"
	"net/http"
    "os"
    "path/filepath"
	"time"

	"github.com/yourusername/nodeguarder/queue"
)

var ErrUnauthorized = errors.New("unauthorized")

// Client handles communication with the dashboard API
type Client struct {
	baseURL    string
	serverID   string
	apiSecret  string
	httpClient *http.Client
	queue      *queue.Queue
}

// NewClient creates a new API client
func NewClient(baseURL, serverID, apiSecret string, disableSSLVerify bool) *Client {
	return &Client{
		baseURL:   baseURL,
		serverID:  serverID,
		apiSecret: apiSecret,
		queue:     nil, // Queue will be set separately
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					InsecureSkipVerify: disableSSLVerify,
				},
			},
		},
	}
}

// SetQueue attaches a resilience queue to the client
func (c *Client) SetQueue(q *queue.Queue) {
	c.queue = q
}

// RegisterRequest represents the agent registration payload
type RegisterRequest struct {
	ServerID          string `json:"server_id"`
	Hostname          string `json:"hostname"`
	OSName            string `json:"os_name"`
	OSVersion         string `json:"os_version"`
	AgentVersion      string `json:"agent_version"`
	APISecret         string `json:"api_secret"`
	RegistrationToken string `json:"registration_token"`
}

// MetricsRequest represents the metrics push payload
type MetricsRequest struct {
	ServerID  string                 `json:"server_id"`
	APISecret string                 `json:"api_secret"`
	Timestamp int64                  `json:"timestamp"`
	Metrics   map[string]interface{} `json:"metrics"`
}

// EventsRequest represents the events push payload
type EventsRequest struct {
	ServerID  string  `json:"server_id"`
	APISecret string  `json:"api_secret"`
	Events    []Event `json:"events"`
}

// Event represents a single event
type Event struct {
	Type      string `json:"type"`
	Severity  string `json:"severity"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
	Details   string `json:"details,omitempty"`
}

// AgentConfig matches the backend configuration
type AgentConfig struct {
	DriftIgnore       []string          `json:"drift_ignore"`
	DriftPaths        []string          `json:"drift_paths"`
    DriftInterval     int               `json:"drift_interval"`
    HealthEnabled     bool              `json:"health_enabled"` 
    HealthSustainDuration int           `json:"health_sustain_duration"`
    CronEnabled       bool              `json:"cron_enabled"`
	CronAutoDiscover  bool              `json:"cron_auto_discover"`
	CronIgnore        map[string][]int  `json:"cron_ignore"`
	CronGlobalTimeout int               `json:"cron_global_timeout"`
	CronTimeouts      map[string]int    `json:"cron_timeouts"`
	CollectLogs       bool              `json:"collect_logs"`
	Thresholds        ResourceThresholds `json:"thresholds"`
	OfflineTimeout    int               `json:"offline_timeout"`
    Uninstall         bool              `json:"uninstall"`
}

// ResourceThresholds configures warning/critical levels
type ResourceThresholds struct {
	CPUWarning      float64 `json:"cpu_warning"`
	CPUCritical     float64 `json:"cpu_critical"`
	MemoryWarning   float64 `json:"memory_warning"`
	MemoryCritical  float64 `json:"memory_critical"`
	DiskWarning     float64 `json:"disk_warning"`
	DiskCritical    float64 `json:"disk_critical"`
}

// Register registers the agent with the dashboard
func (c *Client) Register(req RegisterRequest) error {
	// Populate fields from client config
	req.ServerID = c.serverID
	req.APISecret = c.apiSecret
	
	return c.post("/api/v1/agent/register", req, nil)
}

// PushMetrics sends metrics to the dashboard, or queues them if unavailable
func (c *Client) PushMetrics(metrics map[string]interface{}) error {
	req := MetricsRequest{
		ServerID:  c.serverID,
		APISecret: c.apiSecret,
		Timestamp: time.Now().Unix(),
		Metrics:   metrics,
	}

	err := c.post("/api/v1/agent/metrics", req, nil)
	if err != nil {
		// If dashboard is unreachable and we have a queue, queue the metrics
		if c.queue != nil {
			c.queue.SetConnected(false)
			queueErr := c.queue.PushMetrics(metrics)
			if queueErr != nil {
				log.Printf("Warning: Failed to queue metrics: %v", queueErr)
			}
			return fmt.Errorf("dashboard unavailable, metrics queued: %w", err)
		}
		return err
	}

	// Mark connection as available
	if c.queue != nil {
		c.queue.SetConnected(true)
	}

	return nil
}

// PushEvents sends events to the dashboard, or queues them if unavailable
func (c *Client) PushEvents(events []Event) error {
	if len(events) == 0 {
		return nil
	}

	req := EventsRequest{
		ServerID:  c.serverID,
		APISecret: c.apiSecret,
		Events:    events,
	}

	err := c.post("/api/v1/agent/events", req, nil)
	if err != nil {
		// If dashboard is unreachable and we have a queue, queue the events
		if c.queue != nil {
			c.queue.SetConnected(false)
			eventsPayload := make([]interface{}, len(events))
			for i, e := range events {
				eventsPayload[i] = e
			}
			queueErr := c.queue.PushEvents(eventsPayload)
			if queueErr != nil {
				log.Printf("Warning: Failed to queue events: %v", queueErr)
			}
			return fmt.Errorf("dashboard unavailable, events queued: %w", err)
		}
		return err
	}

	// Mark connection as available
	if c.queue != nil {
		c.queue.SetConnected(true)
	}

	return nil
}

// GetConfig fetches the dynamic configuration from the dashboard
func (c *Client) GetConfig() (*AgentConfig, error) {
	var config AgentConfig
	// Pass auth params in query string as per handler implementation
	endpoint := fmt.Sprintf("/api/v1/agent/config?server_id=%s&api_secret=%s", c.serverID, c.apiSecret)
	
	// We use a custom GET request here since c.post is for POST
	url := c.baseURL + endpoint
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "nodeguarder-agent/1.0")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// defer resp.Body.Close() // Body is closed explicitly later

	if resp.StatusCode == 401 {
		resp.Body.Close() // Close body on early exit
		return nil, ErrUnauthorized
	}

	if resp.StatusCode != 200 {
		bodyBytes, _ := io.ReadAll(resp.Body) // Read body for error message
		resp.Body.Close() // Close body after reading
		return nil, fmt.Errorf("unexpected status code: %d, body: %s", resp.StatusCode, string(bodyBytes))
	}

	// Read body for debug
    bodyBytes, _ := io.ReadAll(resp.Body)
    resp.Body.Close()
    log.Println("DEBUG: Raw Config Response:", string(bodyBytes))

    // Re-create reader for decoder (or unmarshal directly)
    if err := json.Unmarshal(bodyBytes, &config); err != nil {
        return nil, fmt.Errorf("failed to decode config: %w", err)
    }

	return &config, nil
}

// post sends a POST request to the given endpoint
func (c *Client) post(endpoint string, payload interface{}, response interface{}) error {
	url := c.baseURL + endpoint

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "nodeguarder-agent/1.0")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()


	if resp.StatusCode == 401 {
		return ErrUnauthorized
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("request failed with status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	if response != nil {
		if err := json.NewDecoder(resp.Body).Decode(response); err != nil {
			return fmt.Errorf("failed to decode response: %w", err)
		}
	}

	return nil
}

// FlushQueue attempts to send all queued items to the dashboard
func (c *Client) FlushQueue() (sent int, failed int, err error) {
	if c.queue == nil {
		return 0, 0, nil
	}

	pending, err := c.queue.GetPending()
	if err != nil {
		return 0, 0, fmt.Errorf("failed to get pending queue items: %w", err)
	}

	if len(pending) == 0 {
		return 0, 0, nil
	}

	log.Printf("Attempting to flush %d queued items", len(pending))

	for _, item := range pending {
		var sendErr error

		if item.Type == "metrics" {
			// Unmarshal and resend metrics
			var metrics map[string]interface{}
			if err := json.Unmarshal([]byte(item.Payload), &metrics); err != nil {
				log.Printf("Failed to unmarshal queued metrics: %v", err)
				failed++
				c.queue.MarkFailed(item.ID, fmt.Sprintf("unmarshal error: %v", err))
				continue
			}

			sendErr = c.post("/api/v1/agent/metrics", MetricsRequest{
				ServerID:  c.serverID,
				APISecret: c.apiSecret,
				Timestamp: item.Timestamp,
				Metrics:   metrics,
			}, nil)

		} else if item.Type == "events" {
			// Unmarshal and resend events
			var events []Event
			if err := json.Unmarshal([]byte(item.Payload), &events); err != nil {
				log.Printf("Failed to unmarshal queued events: %v", err)
				failed++
				c.queue.MarkFailed(item.ID, fmt.Sprintf("unmarshal error: %v", err))
				continue
			}

			sendErr = c.post("/api/v1/agent/events", EventsRequest{
				ServerID:  c.serverID,
				APISecret: c.apiSecret,
				Events:    events,
			}, nil)
		}

		if sendErr != nil {
			log.Printf("Failed to send queued item %d: %v", item.ID, sendErr)
			failed++
			c.queue.MarkFailed(item.ID, sendErr.Error())
		} else {
			log.Printf("Successfully sent queued item %d (%s)", item.ID, item.Type)
			sent++
			c.queue.MarkSent(item.ID)
		}
	}

	// Update connection status
	if failed == 0 && sent > 0 {
		c.queue.SetConnected(true)
	}

	return sent, failed, nil
}

// UploadLogs uploads a zip file of logs to the dashboard
func (c *Client) UploadLogs(filePath string) error {
    file, err := os.Open(filePath)
    if err != nil {
        return fmt.Errorf("failed to open log file: %w", err)
    }
    defer file.Close()

    body := &bytes.Buffer{}
    writer := multipart.NewWriter(body)

    // Add API Secret and Server ID fields
    _ = writer.WriteField("server_id", c.serverID)
    _ = writer.WriteField("api_secret", c.apiSecret)

    part, err := writer.CreateFormFile("logs", filepath.Base(filePath))
    if err != nil {
        return fmt.Errorf("failed to create form file: %w", err)
    }
    _, err = io.Copy(part, file)
    if err != nil {
        return fmt.Errorf("failed to copy file content: %w", err)
    }

    err = writer.Close()
    if err != nil {
        return fmt.Errorf("failed to close writer: %w", err)
    }

    req, err := http.NewRequest("POST", c.baseURL+"/api/v1/agent/logs", body)
    if err != nil {
        return fmt.Errorf("failed to create request: %w", err)
    }

    req.Header.Set("Content-Type", writer.FormDataContentType())
    req.Header.Set("User-Agent", "nodeguarder-agent/1.0")
    
    // Execute request
    resp, err := c.httpClient.Do(req)
    if err != nil {
        return fmt.Errorf("failed to send request: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        respBody, _ := io.ReadAll(resp.Body)
        return fmt.Errorf("server returned status: %d, body: %s", resp.StatusCode, string(respBody))
    }

    return nil
}
