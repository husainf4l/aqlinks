package api

import (
	"aq-server/internal/database"
	"github.com/gofiber/fiber/v2"
)

// SetupRoutes configures all API routes
func SetupRoutes(app *fiber.App) error {
	// Get test company for API key validation
	testCompany, err := database.GetCompanyByID("test-company")
	if err != nil {
		return err
	}
	if testCompany == nil {
		// Create test company if doesn't exist
		testCompany = &database.Company{
			ID:        "test-company",
			Name:      "Test Company",
			APIKey:    "pk_test_company",
			SecretKey: "sk_test_company_secret",
			Tier:      "free",
			IsActive:  true,
		}
		if err := database.DB.Create(testCompany).Error; err != nil {
			return err
		}
	}

	// Public routes (no auth required)
	public := app.Group("/api/v1")
	public.Post("/tokens", APIKeyMiddleware(), GenerateTokenHandler)

	// Protected routes (token required)
	protected := app.Group("/api/v1")
	protected.Use(AuthMiddleware(testCompany.SecretKey))

	// Room management
	protected.Get("/rooms", ListRoomsHandler)
	protected.Post("/rooms", CreateRoomHandler)
	protected.Get("/rooms/:roomId", GetRoomHandler)
	protected.Put("/rooms/:roomId", UpdateRoomHandler)
	protected.Delete("/rooms/:roomId", DeleteRoomHandler)

	return nil
}
