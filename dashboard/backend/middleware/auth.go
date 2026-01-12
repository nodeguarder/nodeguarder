package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret []byte

// SetJWTSecret sets the secret key used for JWT validation
func SetJWTSecret(secret []byte) {
	jwtSecret = secret
}

// AuthRequired validates JWT tokens
func AuthRequired(c *fiber.Ctx) error {
	// Get token from Authorization header
	authHeader := c.Get("Authorization")
	var tokenString string

	if authHeader != "" {
		// Extract token from "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && parts[0] == "Bearer" {
			tokenString = parts[1]
		}
	}
	
	// Fallback to query parameter "token" (for downloads)
	if tokenString == "" {
		tokenString = c.Query("token")
	}

	if tokenString == "" {
		return c.Status(401).JSON(fiber.Map{"error": "Missing authorization header or token"})
	}

	// Parse and validate token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})

	if err != nil || !token.Valid {
		return c.Status(401).JSON(fiber.Map{"error": "Invalid token"})
	}

	// Extract claims
	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		c.Locals("user_id", int64(claims["user_id"].(float64)))
		c.Locals("username", claims["username"].(string))
	}

	return c.Next()
}
