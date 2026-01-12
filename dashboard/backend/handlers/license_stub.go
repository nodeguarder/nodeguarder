//go:build !enterprise

package handlers

import (
	"github.com/gofiber/fiber/v2"
)

// GenerateLicense is a stub for the public version
func GenerateLicense(c *fiber.Ctx) error {
	return c.Status(404).JSON(fiber.Map{
		"error": "License generation is not available in the public version.",
	})
}
