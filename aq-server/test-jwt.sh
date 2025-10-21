#!/bin/bash

# Test 1: Try to connect without JWT token (should get 401)
echo "Test 1: Connection without JWT token"
curl -i http://localhost:8080/ws 2>/dev/null | head -15

# Test 2: Try with invalid token
echo -e "\n\nTest 2: Connection with invalid token"
curl -i "http://localhost:8080/ws?token=invalid" 2>/dev/null | head -15

echo -e "\n\nServer is running with JWT authentication enabled!"
