package api

import (
	"time"

	"aq-server/internal/database"
	"github.com/gofiber/fiber/v2"
)

// TokenRequest represents a token generation request
type TokenRequest struct {
	RoomID   string `json:"room_id" validate:"required"`
	UserName string `json:"user_name" validate:"required"`
	Duration int    `json:"duration" validate:"required,min=60,max=86400"` // 1 min to 24 hours
}

// TokenResponse represents a token generation response
type TokenResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	RoomID    string    `json:"room_id"`
	UserName  string    `json:"user_name"`
}

// GenerateTokenHandler generates a JWT token for room access
func GenerateTokenHandler(c *fiber.Ctx) error {
	var req TokenRequest

	// Parse request body
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body: " + err.Error(),
		})
	}

	// Validate request
	if req.RoomID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "room_id is required",
		})
	}
	if req.UserName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "user_name is required",
		})
	}
	if req.Duration < 60 || req.Duration > 86400 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "duration must be between 60 and 86400 seconds",
		})
	}

	// Get API key from context (set by middleware)
	apiKey := c.Locals("api_key")
	if apiKey == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "api key not found",
		})
	}

	// Get company by API key
	company, err := database.GetCompanyByAPIKey(apiKey.(string))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "database error: " + err.Error(),
		})
	}
	if company == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid api key",
		})
	}

	// Generate JWT token
	token, expiresAt, err := GenerateToken(company.ID, req.RoomID, req.UserName, company.SecretKey, req.Duration)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to generate token: " + err.Error(),
		})
	}

	// Hash token for storage
	tokenHash := HashToken(token)

	// Store token in database
	dbToken := &database.Token{
		CompanyID: company.ID,
		TokenHash: tokenHash,
		RoomID:    req.RoomID,
		UserName:  req.UserName,
		ExpiresAt: expiresAt,
	}

	if err := database.CreateToken(dbToken); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to store token: " + err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(TokenResponse{
		Token:     token,
		ExpiresAt: expiresAt,
		RoomID:    req.RoomID,
		UserName:  req.UserName,
	})
}
