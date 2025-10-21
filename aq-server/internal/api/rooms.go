package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"aq-server/internal/database"
	"github.com/google/uuid"
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
func ListRoomsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	companyID := r.Context().Value(CompanyIDKey)
	if companyID == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "company id not found",
		})
		return
	}

	var rooms []database.Room
	result := database.DB.Where("company_id = ?", companyID.(string)).Find(&rooms)
	if result.Error != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "database error: " + result.Error.Error(),
		})
		return
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

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(responses)
}

// CreateRoomHandler creates a new room
func CreateRoomHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	companyID := r.Context().Value(CompanyIDKey)
	if companyID == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "company id not found",
		})
		return
	}

	var req RoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid request body: " + err.Error(),
		})
		return
	}

	// Validate request
	if req.RoomID == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": "room_id is required",
		})
		return
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
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to create room: " + result.Error.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(RoomResponse{
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
func GetRoomHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	companyID := r.Context().Value(CompanyIDKey)
	if companyID == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "company id not found",
		})
		return
	}

	// Extract room ID from path: /api/v1/rooms/{roomId}
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid path",
		})
		return
	}
	roomID := parts[4]

	var room database.Room
	result := database.DB.Where("id = ? AND company_id = ?", roomID, companyID.(string)).First(&room)
	if result.Error != nil {
		if result.Error.Error() == "record not found" {
			respondJSON(w, http.StatusNotFound, map[string]string{
				"error": "room not found",
			})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "database error: " + result.Error.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(RoomResponse{
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
func UpdateRoomHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	companyID := r.Context().Value(CompanyIDKey)
	if companyID == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "company id not found",
		})
		return
	}

	// Extract room ID from path
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid path",
		})
		return
	}
	roomID := parts[4]

	var req RoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid request body: " + err.Error(),
		})
		return
	}

	// Get room
	var room database.Room
	result := database.DB.Where("id = ? AND company_id = ?", roomID, companyID.(string)).First(&room)
	if result.Error != nil {
		if result.Error.Error() == "record not found" {
			respondJSON(w, http.StatusNotFound, map[string]string{
				"error": "room not found",
			})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "database error: " + result.Error.Error(),
		})
		return
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
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to update room: " + result.Error.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(RoomResponse{
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
func DeleteRoomHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	companyID := r.Context().Value(CompanyIDKey)
	if companyID == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "company id not found",
		})
		return
	}

	// Extract room ID from path
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid path",
		})
		return
	}
	roomID := parts[4]

	// Check room exists and belongs to company
	var room database.Room
	result := database.DB.Where("id = ? AND company_id = ?", roomID, companyID.(string)).First(&room)
	if result.Error != nil {
		if result.Error.Error() == "record not found" {
			respondJSON(w, http.StatusNotFound, map[string]string{
				"error": "room not found",
			})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "database error: " + result.Error.Error(),
		})
		return
	}

	// Delete
	result = database.DB.Delete(&room)
	if result.Error != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to delete room: " + result.Error.Error(),
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
