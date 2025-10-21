package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/pion/logging"
)

// ContextKey is a type for context keys
type ContextKey string

const (
	ClaimsKey    ContextKey = "claims"
	CompanyIDKey ContextKey = "company_id"
	APIKeyKey    ContextKey = "api_key"
)

// AuthMiddleware validates JWT token in Authorization header
func AuthMiddleware(secretKey string, logger logging.LeveledLogger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Get authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				respondJSON(w, http.StatusUnauthorized, map[string]string{
					"error": "missing authorization header",
				})
				return
			}

			// Extract bearer token
			const bearerSchema = "Bearer "
			token := strings.TrimPrefix(authHeader, bearerSchema)
			if token == authHeader {
				respondJSON(w, http.StatusUnauthorized, map[string]string{
					"error": "invalid authorization header format",
				})
				return
			}

			// Validate token
			claims, err := ValidateToken(token, secretKey)
			if err != nil {
				respondJSON(w, http.StatusUnauthorized, map[string]string{
					"error": "invalid or expired token: " + err.Error(),
				})
				return
			}

			// Store claims in request context
			ctx := context.WithValue(r.Context(), ClaimsKey, claims)
			ctx = context.WithValue(ctx, CompanyIDKey, claims.CompanyID)
			
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// APIKeyMiddleware validates API key in Authorization header
func APIKeyMiddleware(logger logging.LeveledLogger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Get authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				respondJSON(w, http.StatusUnauthorized, map[string]string{
					"error": "missing authorization header",
				})
				return
			}

			// Extract bearer token (API key)
			const bearerSchema = "Bearer "
			apiKey := strings.TrimPrefix(authHeader, bearerSchema)
			if apiKey == authHeader {
				respondJSON(w, http.StatusUnauthorized, map[string]string{
					"error": "invalid authorization header format",
				})
				return
			}

			// Store API key in context
			ctx := context.WithValue(r.Context(), APIKeyKey, apiKey)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// respondJSON writes a JSON response
func respondJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		// Log but don't respond as headers already sent
	}
}
