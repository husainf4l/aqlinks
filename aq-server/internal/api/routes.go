package api

import (
	"context"
	"net/http"
	"strings"

	"aq-server/internal/database"
)

// SetupRoutes configures all API routes
func SetupRoutes(mux *http.ServeMux) error {
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

	// Wrap handlers with middleware
	mux.HandleFunc("/api/v1/tokens", withAPIKeyAuth(GenerateTokenHandler))

	mux.HandleFunc("/api/v1/rooms", func(w http.ResponseWriter, r *http.Request) {
		withAuth(testCompany.SecretKey, func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet {
				ListRoomsHandler(w, r)
			} else if r.Method == http.MethodPost {
				CreateRoomHandler(w, r)
			} else {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
		})(w, r)
	})

	mux.HandleFunc("/api/v1/rooms/", func(w http.ResponseWriter, r *http.Request) {
		withAuth(testCompany.SecretKey, func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet {
				GetRoomHandler(w, r)
			} else if r.Method == http.MethodPut {
				UpdateRoomHandler(w, r)
			} else if r.Method == http.MethodDelete {
				DeleteRoomHandler(w, r)
			} else {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
		})(w, r)
	})

	return nil
}

// withAPIKeyAuth is a middleware that validates API key
func withAPIKeyAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			respondJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "missing authorization header",
			})
			return
		}

		const bearerSchema = "Bearer "
		if !strings.HasPrefix(authHeader, bearerSchema) {
			respondJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "invalid authorization header format",
			})
			return
		}

		apiKey := authHeader[len(bearerSchema):]

		// Store API key in context
		ctx := context.WithValue(r.Context(), APIKeyKey, apiKey)
		next(w, r.WithContext(ctx))
	}
}

// withAuth is a middleware that validates JWT token
func withAuth(secretKey string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			respondJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "missing authorization header",
			})
			return
		}

		const bearerSchema = "Bearer "
		if !strings.HasPrefix(authHeader, bearerSchema) {
			respondJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "invalid authorization header format",
			})
			return
		}

		token := authHeader[len(bearerSchema):]

		claims, err := ValidateToken(token, secretKey)
		if err != nil {
			respondJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "invalid or expired token: " + err.Error(),
			})
			return
		}

		// Store claims in context
		ctx := context.WithValue(r.Context(), ClaimsKey, claims)
		ctx = context.WithValue(ctx, CompanyIDKey, claims.CompanyID)

		next(w, r.WithContext(ctx))
	}
}
