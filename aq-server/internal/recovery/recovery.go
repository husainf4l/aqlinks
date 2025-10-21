package recovery

import (
	"fmt"
	"net/http"
	"runtime/debug"

	"github.com/pion/logging"
)

// RecoveryMiddleware recovers from panics and logs them
func RecoveryMiddleware(logger logging.LeveledLogger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				// Log the panic with full stack trace
				logger.Errorf("PANIC: %v\nStack trace:\n%s", err, debug.Stack())

				// Send error response if headers haven't been written
				if !isHeaderWritten(w) {
					http.Error(w, fmt.Sprintf("Internal server error: %v", err), http.StatusInternalServerError)
				}
			}
		}()

		next.ServeHTTP(w, r)
	})
}

// isHeaderWritten checks if response headers have been sent
func isHeaderWritten(w http.ResponseWriter) bool {
	// Check if status code has been set by converting to *http.ResponseWriter
	// This is a simple check - if http.Error was called, headers are written
	return w.Header().Get("Content-Type") != "" || w.Header().Get("Content-Length") != ""
}

// SafeCloser wraps a close operation to prevent panics
func SafeCloser(logger logging.LeveledLogger, fn func() error, name string) {
	defer func() {
		if err := recover(); err != nil {
			logger.Errorf("PANIC during %s close: %v", name, err)
		}
	}()

	if err := fn(); err != nil {
		logger.Errorf("Error closing %s: %v", name, err)
	}
}
