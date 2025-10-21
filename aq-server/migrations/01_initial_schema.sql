-- Create companies table
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  company_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  api_key VARCHAR(255) UNIQUE NOT NULL,
  secret_key VARCHAR(255) NOT NULL,
  tier VARCHAR(50) DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create token_requests table
CREATE TABLE IF NOT EXISTS token_requests (
  id SERIAL PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  room_id VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL,
  room_id VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  disconnected_at TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_companies_api_key ON companies(api_key);
CREATE INDEX IF NOT EXISTS idx_companies_company_id ON companies(company_id);
CREATE INDEX IF NOT EXISTS idx_token_requests_token_hash ON token_requests(token_hash);
CREATE INDEX IF NOT EXISTS idx_token_requests_expires_at ON token_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_token_requests_company_id ON token_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_sessions_company_room ON sessions(company_id, room_id);
CREATE INDEX IF NOT EXISTS idx_sessions_company_id ON sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(company_id, room_id) WHERE disconnected_at IS NULL;

-- Insert test company
INSERT INTO companies (company_id, name, api_key, secret_key, tier)
VALUES ('test-company', 'Test Company', 'pk_test_abc123', 'sk_test_secret123', 'free')
ON CONFLICT (company_id) DO NOTHING;
