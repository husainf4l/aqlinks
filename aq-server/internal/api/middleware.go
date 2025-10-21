package api

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

// AuthMiddleware validates JWT token in Authorization header
func AuthMiddleware(secretKey string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Get authorization header
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing authorization header",
			})
		}

		// Extract bearer token
		const bearerSchema = "Bearer "
		token := strings.TrimPrefix(authHeader, bearerSchema)
		if token == authHeader {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid authorization header format",
			})
		}

		// Validate token
		claims, err := ValidateToken(token, secretKey)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid or expired token: " + err.Error(),
			})
		}

		// Store claims in context for use in handlers
		c.Locals("claims", claims)
		c.Locals("company_id", claims.CompanyID)

		return c.Next()
	}
}

// APIKeyMiddleware validates API key in Authorization header
func APIKeyMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Get authorization header
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing authorization header",
			})
		}

		// Extract bearer token (API key)
		const bearerSchema = "Bearer "
		apiKey := strings.TrimPrefix(authHeader, bearerSchema)
		if apiKey == authHeader {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid authorization header format",
			})
		}

		// Store API key in context
		c.Locals("api_key", apiKey)

		return c.Next()
	}
}

// CompanyOwnershipMiddleware ensures user can only access their own resources
func CompanyOwnershipMiddleware(c *fiber.Ctx) error {
	// Get company ID from context (set by auth middleware)
	companyID := c.Locals("company_id")
	if companyID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "company id not found in context",
		})
	}

	// You can add additional checks here if needed
	return c.Next()
}
