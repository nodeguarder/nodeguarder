package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/yourusername/health-dashboard-backend/database"
	"github.com/yourusername/health-dashboard-backend/models"
	"golang.org/x/crypto/bcrypt"
)

var jwtSecret []byte
var RegistrationToken string

// InitJWTSecret initializes the global JWT secret from DB or generates a new one
func InitJWTSecret() error {
	// 1. Try to get from DB
	var secretHex string
	err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'jwt_secret'").Scan(&secretHex)
	
	if err == sql.ErrNoRows {
		// 2. Not found: Generate new random secret
		secretBytes := make([]byte, 32)
		if _, err := rand.Read(secretBytes); err != nil {
			return fmt.Errorf("failed to generate random JWT secret: %v", err)
		}
		secretHex = hex.EncodeToString(secretBytes)
		
		// 3. Save to DB
		_, err := database.DB.Exec(
			"INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)", 
			"jwt_secret", secretHex, time.Now().Unix(),
		)
		if err != nil {
			return fmt.Errorf("failed to save JWT secret: %v", err)
		}
		log.Println("🔑 Generated and persisted new JWT secret")
	} else if err != nil {
		return fmt.Errorf("failed to query JWT secret: %v", err)
	} else {
		log.Println("🔑 JWT Secret loaded from database")
	}

	// 4. Decode hex to bytes
	var decodeErr error
	jwtSecret, decodeErr = hex.DecodeString(secretHex)
	if decodeErr != nil {
		return fmt.Errorf("failed to decode JWT secret from DB: %v", decodeErr)
	}

	return nil
}

// GetJWTSecret returns the global JWT secret
func GetJWTSecret() []byte {
	return jwtSecret
}

// InitRegistrationToken initializes the global registration token from DB or generates a new one
func InitRegistrationToken() error {
	// Try to get from DB
	var token string
	err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'registration_token'").Scan(&token)
	
	if err == sql.ErrNoRows {
		// Only use env var if specifically set (e.g. for forced override), otherwise generate random
		envToken := os.Getenv("REGISTRATION_TOKEN")
		if envToken != "" {
			token = envToken
			log.Printf("🔑 Registration Token loaded from env (override)")
		} else {
			token = generateRandomToken(16)
			log.Printf("🔑 Generated new random Registration Token")
		}

		// Save to DB
		_, err := database.DB.Exec(
			"INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)", 
			"registration_token", token, time.Now().Unix(),
		)
		if err != nil {
			return fmt.Errorf("failed to save registration token: %v", err)
		}
	} else if err != nil {
		return fmt.Errorf("failed to query registration token: %v", err)
	} else {
		log.Printf("🔑 Registration Token loaded from database")
	}

	RegistrationToken = token
	return nil
}

// generateRandomToken helper
func generateRandomToken(length int) string {
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return "token-" + fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

// GetRegistrationToken returns the current global registration token (admin only)
func GetRegistrationToken(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"token": RegistrationToken,
	})
}

// EnsureAdminUser checks for ADMIN_PASSWORD env var and creates/updates the admin user
func EnsureAdminUser() error {
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminPassword == "" {
		log.Println("⚠️ ADMIN_PASSWORD not set. Admin user will not be created/updated.")
		return nil
	}

	// Hash the password
	hash, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash admin password: %v", err)
	}

	// Check if admin exists
	var id int64
	var passwordChanged bool
	err = database.DB.QueryRow("SELECT id, COALESCE(password_changed, 0) FROM users WHERE username = 'admin'").Scan(&id, &passwordChanged)
	
	if err == sql.ErrNoRows {
		// Create new admin
		_, err = database.DB.Exec(
			"INSERT INTO users (username, password_hash, created_at, password_changed) VALUES (?, ?, ?, 0)",
			"admin", string(hash), time.Now().Unix(),
		)
		if err != nil {
			return fmt.Errorf("failed to create admin user: %v", err)
		}
		log.Println("✅ Admin user created from environment variable")
	} else if err != nil {
		return fmt.Errorf("failed to query admin user: %v", err)
	} else {
		// If password has been manually changed by the user, DO NOT overwrite it with the env var
		if passwordChanged {
			log.Println("ℹ️ Admin password has been changed by user. Skipping env var override.")
			return nil
		}

		// Update existing admin password AND reset password_changed to false (0)
		_, err = database.DB.Exec(
			"UPDATE users SET password_hash = ?, password_changed = 0 WHERE id = ?",
			string(hash), id,
		)
		if err != nil {
			return fmt.Errorf("failed to update admin password: %v", err)
		}
		log.Println("✅ Admin password updated from environment variable")
	}
	return nil
}

// Login handles admin login
func Login(c *fiber.Ctx) error {
	var req models.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request"})
	}

	// Get user from database
	var user models.User
	err := database.DB.QueryRow(`
		SELECT id, username, password_hash, created_at, COALESCE(password_changed, 0)
		FROM users 
		WHERE username = ?
	`, req.Username).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.CreatedAt, &user.PasswordChanged)

	if err == sql.ErrNoRows {
		log.Printf("❌ User not found: %s", req.Username)
		return c.Status(401).JSON(fiber.Map{"error": "Invalid credentials"})
	} else if err != nil {
		log.Printf("❌ Database error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Database error"})
	}
	log.Printf("✅ User found: %s (ID: %d)", user.Username, user.ID)

	// Verify password
	log.Printf("🔐 Login attempt - Username: %s", req.Username)
	// Debug logging removed for security

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		log.Printf("❌ Password comparison failed: %v", err)
		return c.Status(401).JSON(fiber.Map{"error": "Invalid credentials"})
	}
	
	log.Printf("✅ Password verified successfully")

	// Generate JWT
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":  user.ID,
		"username": user.Username,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	})

	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to generate token"})
	}

	return c.JSON(models.LoginResponse{
		Token: tokenString,
		User:  user,
	})
}

// ChangePassword allows the admin to change their password
func ChangePassword(c *fiber.Ctx) error {
	// Get user from context (set by auth middleware)
	userID := c.Locals("user_id").(int64)

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword    string `json:"new_password"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request"})
	}

	// Get current password hash
	var currentHash string
	err := database.DB.QueryRow("SELECT password_hash FROM users WHERE id = ?", userID).Scan(&currentHash)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Database error"})
	}

	// Verify current password
	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.CurrentPassword)); err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Current password is incorrect"})
	}

	// Hash new password
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to hash password"})
	}

	// Update password and set password_changed to true (1)
	_, err = database.DB.Exec("UPDATE users SET password_hash = ?, password_changed = 1 WHERE id = ?", string(newHash), userID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to update password"})
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// End of auth handlers

