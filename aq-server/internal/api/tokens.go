package api

import (
	"encoding/json"
	"net/http"
	"time"

	"aq-server/internal/database"
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
func GenerateTokenHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req TokenRequest

	// Parse request body
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
	if req.UserName == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": "user_name is required",
		})
		return
	}
	if req.Duration < 60 || req.Duration > 86400 {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": "duration must be between 60 and 86400 seconds",
		})
		return
	}

	// Get API key from context (set by middleware)
	apiKey := r.Context().Value(APIKeyKey)
	if apiKey == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "api key not found",
		})
		return
	}

	// Get company by API key
	company, err := database.GetCompanyByAPIKey(apiKey.(string))
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "database error: " + err.Error(),
		})
		return
	}
	if company == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "invalid api key",
		})
		return
	}

	// Generate JWT token
	token, expiresAt, err := GenerateToken(company.ID, req.RoomID, req.UserName, company.SecretKey, req.Duration)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to generate token: " + err.Error(),
		})
		return
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
		respondJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to store token: " + err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(TokenResponse{
		Token:     token,
		ExpiresAt: expiresAt,
		RoomID:    req.RoomID,
		UserName:  req.UserName,
	})
}
