package api

import (
	"time"

	"aq-server/internal/database"
	"github.com/google/uuid"
	"github.com/gofiber/fiber/v2"
)

// RoomRequest represents a room creation/update request
type RoomRequest struct {
	RoomID          string `json:"room_id" validate:"required"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	MaxParticipants int    `json:"max_participants"`
}

// RoomResponse represents a room in responses
type RoomResponse struct {
	ID              string    `json:"id"`
	CompanyID       string    `json:"company_id"`
	RoomID          string    `json:"room_id"`
	Name            string    `json:"name"`
	Description     string    `json:"description"`
	MaxParticipants int       `json:"max_participants"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// ListRoomsHandler lists all rooms for a company
func ListRoomsHandler(c *fiber.Ctx) error {
	companyID := c.Locals("company_id")
	if companyID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "company id not found",
		})
	}

	var rooms []database.Room
	result := database.DB.Where("company_id = ?", companyID.(string)).Find(&rooms)
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "database error: " + result.Error.Error(),
		})
	}

	// Convert to response format
	responses := make([]RoomResponse, len(rooms))
	for i, room := range rooms {
		responses[i] = RoomResponse{
			ID:              room.ID,
			CompanyID:       room.CompanyID,
			RoomID:          room.RoomID,
			Name:            room.Name,
			Description:     room.Description,
			MaxParticipants: room.MaxParticipants,
			CreatedAt:       room.CreatedAt,
			UpdatedAt:       room.UpdatedAt,
		}
	}

	return c.JSON(responses)
}

// CreateRoomHandler creates a new room
func CreateRoomHandler(c *fiber.Ctx) error {
	companyID := c.Locals("company_id")
	if companyID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "company id not found",
		})
	}

	var req RoomRequest
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

	// Create room
	room := &database.Room{
		ID:              uuid.New().String(),
		CompanyID:       companyID.(string),
		RoomID:          req.RoomID,
		Name:            req.Name,
		Description:     req.Description,
		MaxParticipants: req.MaxParticipants,
	}

	if room.MaxParticipants == 0 {
		room.MaxParticipants = 100 // Default max participants
	}

	result := database.DB.Create(room)
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to create room: " + result.Error.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(RoomResponse{
		ID:              room.ID,
		CompanyID:       room.CompanyID,
		RoomID:          room.RoomID,
		Name:            room.Name,
		Description:     room.Description,
		MaxParticipants: room.MaxParticipants,
		CreatedAt:       room.CreatedAt,
		UpdatedAt:       room.UpdatedAt,
	})
}

// GetRoomHandler gets a specific room
func GetRoomHandler(c *fiber.Ctx) error {
	companyID := c.Locals("company_id")
	if companyID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "company id not found",
		})
	}

	roomID := c.Params("roomId")
	var room database.Room
	result := database.DB.Where("id = ? AND company_id = ?", roomID, companyID.(string)).First(&room)
	if result.Error != nil {
		if result.Error.Error() == "record not found" {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "room not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "database error: " + result.Error.Error(),
		})
	}

	return c.JSON(RoomResponse{
		ID:              room.ID,
		CompanyID:       room.CompanyID,
		RoomID:          room.RoomID,
		Name:            room.Name,
		Description:     room.Description,
		MaxParticipants: room.MaxParticipants,
		CreatedAt:       room.CreatedAt,
		UpdatedAt:       room.UpdatedAt,
	})
}

// UpdateRoomHandler updates a room
func UpdateRoomHandler(c *fiber.Ctx) error {
	companyID := c.Locals("company_id")
	if companyID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "company id not found",
		})
	}

	roomID := c.Params("roomId")
	var req RoomRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body: " + err.Error(),
		})
	}

	// Get room
	var room database.Room
	result := database.DB.Where("id = ? AND company_id = ?", roomID, companyID.(string)).First(&room)
	if result.Error != nil {
		if result.Error.Error() == "record not found" {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "room not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "database error: " + result.Error.Error(),
		})
	}

	// Update fields
	if req.Name != "" {
		room.Name = req.Name
	}
	if req.Description != "" {
		room.Description = req.Description
	}
	if req.MaxParticipants > 0 {
		room.MaxParticipants = req.MaxParticipants
	}

	// Save
	result = database.DB.Save(&room)
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to update room: " + result.Error.Error(),
		})
	}

	return c.JSON(RoomResponse{
		ID:              room.ID,
		CompanyID:       room.CompanyID,
		RoomID:          room.RoomID,
		Name:            room.Name,
		Description:     room.Description,
		MaxParticipants: room.MaxParticipants,
		CreatedAt:       room.CreatedAt,
		UpdatedAt:       room.UpdatedAt,
	})
}

// DeleteRoomHandler deletes a room
func DeleteRoomHandler(c *fiber.Ctx) error {
	companyID := c.Locals("company_id")
	if companyID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "company id not found",
		})
	}

	roomID := c.Params("roomId")

	// Check room exists and belongs to company
	var room database.Room
	result := database.DB.Where("id = ? AND company_id = ?", roomID, companyID.(string)).First(&room)
	if result.Error != nil {
		if result.Error.Error() == "record not found" {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "room not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "database error: " + result.Error.Error(),
		})
	}

	// Delete
	result = database.DB.Delete(&room)
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to delete room: " + result.Error.Error(),
		})
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}
