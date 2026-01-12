package main

import (
	"log"
	"io"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/yourusername/health-dashboard-backend/database"
	"github.com/yourusername/health-dashboard-backend/handlers"
	"github.com/yourusername/health-dashboard-backend/license"

	"github.com/yourusername/health-dashboard-backend/maintenance"
	"github.com/yourusername/health-dashboard-backend/middleware"
	"gopkg.in/natefinch/lumberjack.v2"
)

func main() {
	// Get database path from environment or use default
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/health.db"
	}

	// Configure logging to both File and Stdout with Rotation
	logFile := &lumberjack.Logger{
		Filename:   "/data/backend.log",
		MaxSize:    10, // megabytes
		MaxBackups: 3,
		MaxAge:     28, // days
		Compress:   true,
	}
	
	// Write to both stdout and file
	mw := io.MultiWriter(os.Stdout, logFile)
	log.SetOutput(mw)

	// Initialize database
	if err := database.Init(dbPath); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Load license
	licensePath := os.Getenv("LICENSE_PATH")
	if licensePath == "" {
		licensePath = "/app/license.yaml"
	}
	if err := license.LoadLicense(licensePath); err != nil {
		log.Fatalf("Failed to load license: %v", err)

	}

	// Initialize JWT Secret (persisted in DB)
	if err := handlers.InitJWTSecret(); err != nil {
		log.Fatalf("Failed to initialize JWT secret: %v", err)
	}

	// Initialize Registration Token (persisted in DB)
	if err := handlers.InitRegistrationToken(); err != nil {
		log.Fatalf("Failed to initialize registration token: %v", err)
	}

	// Initialize Notifications
	handlers.InitNotifications()
	
	// Sync JWT Secret to Middleware
	middleware.SetJWTSecret(handlers.GetJWTSecret())

	// Clean up orphaned events/metrics on startup
	go func() {
		log.Println("🧹 Running startup cleanup for orphaned events...")
		res, err := database.DB.Exec("DELETE FROM events WHERE server_id NOT IN (SELECT id FROM servers)")
		if err == nil {
			rows, _ := res.RowsAffected()
			if rows > 0 {
				log.Printf("✅ Removed %d orphaned events", rows)
			}
		}
		database.DB.Exec("DELETE FROM metrics WHERE server_id NOT IN (SELECT id FROM servers)")
	}()


	// Create default admin user from environment
	if err := handlers.EnsureAdminUser(); err != nil {
		log.Printf("Failed to ensure admin user: %v", err)
	}

	// Start maintenance background worker
	maintenance.StartJanitor()
	maintenance.StartHealthWatcher()

	// Create Fiber app
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})

	// Middleware
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization, X-Dashboard-URL",
		AllowMethods: "GET, POST, PUT, DELETE, OPTIONS",
	}))

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Auth endpoints (public)
	app.Post("/api/v1/auth/login", handlers.Login)
	


	// Agent endpoints (public, authenticated via API secret)
	app.Post("/api/v1/agent/register", handlers.AgentRegister)
	app.Post("/api/v1/agent/metrics", handlers.AgentPushMetrics)
	app.Post("/api/v1/agent/events", handlers.AgentPushEvents)
	app.Post("/api/v1/agent/package/:format", handlers.GenerateAgentPackage)
	app.Get("/api/v1/agent/package/:format", handlers.GenerateAgentPackage)
	app.Get("/api/v1/agent/download/:os/:arch", handlers.DownloadAgent)
	app.Get("/api/v1/agent/version", handlers.GetAgentVersion)
	app.Get("/api/v1/agent/config", handlers.AgentGetConfig)
    app.Post("/api/v1/agent/logs", handlers.AgentUploadLogs)

	// License endpoints (public for status, protected for upload)
	app.Get("/api/v1/license/status", handlers.GetLicenseStatus)

	// Protected admin endpoints
	api := app.Group("/api/v1", middleware.AuthRequired)
	
	// Servers
	api.Get("/servers", handlers.GetServers)
	api.Get("/servers/:id", handlers.GetServer)
	api.Delete("/servers/:id", handlers.DeleteServer)
	api.Get("/servers/:id/metrics", handlers.GetServerMetrics)
	api.Delete("/servers/:id/events", handlers.DeleteServerEvents)
	api.Get("/servers/:id/events", handlers.GetServerEvents)
	api.Get("/servers/:id/health", handlers.GetServerHealth)
    api.Post("/servers/:id/logs/request", handlers.RequestLogs)
    api.Get("/servers/:id/logs/download", handlers.DownloadLogs)
    api.Post("/servers/:id/uninstall", handlers.UninstallAgent)

	// Events
	api.Get("/events", handlers.GetAllEvents)
    api.Delete("/events/:id", handlers.DeleteEvent)

	// Settings (admin only)
	api.Post("/auth/password", middleware.AuthRequired, handlers.ChangePassword)
	api.Get("/auth/registration-token", middleware.AuthRequired, handlers.GetRegistrationToken)
    
	// Alert Settings
	api.Get("/settings/alerts", handlers.GetAlertSettings)
	api.Get("/admin/logs", handlers.DownloadBackendLogs)
	api.Post("/settings/alerts", handlers.SaveAlertSettings)
	api.Post("/settings/alerts/test", handlers.TestAlert)

	// Global Configuration
	api.Get("/config", handlers.GetConfig)
	api.Post("/config", handlers.SaveConfig)


	// License management (admin only)
	api.Post("/license/upload", middleware.AuthRequired, handlers.UploadLicense)

	// License Generator (conditionally enabled for developer image)
	if os.Getenv("INCLUDE_LICENSE_GENERATOR") == "true" {
		api.Post("/auth/generate-license", handlers.GenerateLicense)
		log.Println("✅ License Generator endpoint enabled")
	}

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Serve static files (Frontend) if directory exists
	if _, err := os.Stat("./frontend"); err == nil {
		app.Static("/", "./frontend")
		
		// Handle SPA routing: If file not found, serve index.html
		app.Get("*", func(c *fiber.Ctx) error {
            // Check if request is for API, ignore
            if len(c.Path()) >= 4 && c.Path()[:4] == "/api" {
                return c.Next()
            }
			return c.SendFile("./frontend/index.html")
		})
		log.Println("✅ Serving static frontend from ./frontend")
	}

	log.Printf("🚀 Server starting on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
