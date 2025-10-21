# Refactor to net/http + negroni + gorilla/websocket

## Phase 1: Dependencies & Imports
- [ ] **Task 1:** Add negroni dependency to go.mod
  - Run: `go get github.com/urfave/negroni/v3` to add middleware library
  
- [ ] **Task 2:** Remove Fiber from app.go imports
  - Remove: `github.com/gofiber/fiber/v2` import and replace with `net/http` imports

## Phase 2: Core Refactoring
- [ ] **Task 3:** Refactor App struct to use net/http
  - Replace `fiberApp *fiber.App` with `httpServer *http.Server` and `serveMux *http.ServeMux` in App struct
  
- [ ] **Task 4:** Refactor New() function for net/http
  - Update `New()` to initialize `http.Server` and `http.ServeMux` instead of `fiber.App`
  
- [ ] **Task 5:** Refactor Run() to use net/http with negroni middleware
  - Replace Fiber `Listen()` with `http.Server.ListenAndServe()`, add negroni middleware pipeline

## Phase 3: Handler Conversion
- [ ] **Task 6:** Convert indexHandler to net/http format
  - Change from `fiber.Ctx` to `http.ResponseWriter`, `*http.Request` signature. Serve index.html file
  
- [ ] **Task 7:** Implement clean websocketHandler with gorilla
  - Remove hijacking approach. Use direct gorilla/websocket upgrade with JWT token validation from query params
  
- [ ] **Task 8:** Convert healthHandler to net/http format
  - Change from `fiber.Ctx` to `http.ResponseWriter`, `*http.Request`. Return JSON health status
  
- [ ] **Task 9:** Convert metricsHandler to net/http format
  - Change from `fiber.Ctx` to `http.ResponseWriter`, `*http.Request`. Return JSON metrics

## Phase 4: REST API Integration
- [ ] **Task 10:** Update REST API routes for net/http
  - Modify `internal/api/routes.go` to register routes on `http.ServeMux` instead of Fiber

## Phase 5: Testing & Cleanup
- [ ] **Task 11:** Build and verify no compile errors
  - Run: `/snap/bin/go build ./cmd/server/` to check for any compilation issues
  
- [ ] **Task 12:** Start server and test endpoints
  - Run server on `:8080` and test: `/health`, `/api/v1/tokens`, `/ws` endpoints
  
- [ ] **Task 13:** Test WebSocket connection with token validation
  - Connect to `ws://localhost:8080/ws?token=xxx&room=xxx&username=xxx` and verify stable connection
  
- [ ] **Task 14:** Remove Fiber from go.mod if unused
  - Run: `go mod tidy` to clean up unused dependencies
  
- [ ] **Task 15:** Commit changes to git
  - `git add -A && git commit -m 'Refactor to net/http + negroni + gorilla/websocket (production-proven stack)'`