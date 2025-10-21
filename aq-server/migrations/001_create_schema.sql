-- ============================================================================
-- AQ Server Database Schema - UUID Best Practices
-- ============================================================================
-- Drop all tables if they exist
DROP TABLE IF EXISTS rate_limit_tracker CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS analytics CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS tokens CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. COMPANIES TABLE - Multi-tenant support (ROOT)
-- ============================================================================
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  api_key VARCHAR(255) UNIQUE NOT NULL,
  secret_key VARCHAR(255) NOT NULL,
  tier VARCHAR(50) DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_companies_api_key ON companies(api_key);
CREATE INDEX idx_companies_company_id ON companies(company_id);
CREATE INDEX idx_companies_is_active ON companies(is_active);
CREATE INDEX idx_companies_created_at ON companies(created_at DESC);

-- ============================================================================
-- 2. API_KEYS TABLE - For rate limiting
-- ============================================================================
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  api_key_hash VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  rate_limit_per_minute INT DEFAULT 60,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_keys_company_id ON api_keys(company_id);
CREATE INDEX idx_api_keys_hash ON api_keys(api_key_hash);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);

-- ============================================================================
-- 3. TOKENS TABLE - JWT tokens for room access
-- ============================================================================
CREATE TABLE tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  room_id VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  permissions JSONB DEFAULT '{"publish": true, "subscribe": true}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP WITH TIME ZONE,
  revoked BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_tokens_company_id ON tokens(company_id);
CREATE INDEX idx_tokens_hash ON tokens(token_hash);
CREATE INDEX idx_tokens_expires_at ON tokens(expires_at);
CREATE INDEX idx_tokens_room_id ON tokens(room_id);
CREATE INDEX idx_tokens_active ON tokens(is_used, revoked) WHERE is_used = FALSE AND revoked = FALSE;
CREATE INDEX idx_tokens_created_at ON tokens(created_at DESC);

-- ============================================================================
-- 4. ROOMS TABLE - Video room metadata
-- ============================================================================
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  room_id VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  description TEXT,
  max_participants INT DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(company_id, room_id)
);

CREATE INDEX idx_rooms_company_id ON rooms(company_id);
CREATE INDEX idx_rooms_room_id ON rooms(room_id);
CREATE INDEX idx_rooms_created_at ON rooms(created_at DESC);

-- ============================================================================
-- 5. SESSIONS TABLE - Active user sessions
-- ============================================================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  room_id VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  token_id UUID REFERENCES tokens(id) ON DELETE SET NULL,
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  disconnected_at TIMESTAMP WITH TIME ZONE,
  peer_address VARCHAR(100),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_sessions_company_id ON sessions(company_id);
CREATE INDEX idx_sessions_room_id ON sessions(room_id);
CREATE INDEX idx_sessions_token_id ON sessions(token_id);
CREATE INDEX idx_sessions_active ON sessions(company_id, room_id) WHERE disconnected_at IS NULL;
CREATE INDEX idx_sessions_connected_at ON sessions(connected_at DESC);

-- ============================================================================
-- 6. ANALYTICS TABLE - Usage analytics
-- ============================================================================
CREATE TABLE analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL,
  metric_date DATE NOT NULL,
  value INT DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, metric_type, metric_date)
);

CREATE INDEX idx_analytics_company_id ON analytics(company_id);
CREATE INDEX idx_analytics_metric_date ON analytics(metric_date DESC);
CREATE INDEX idx_analytics_metric_type ON analytics(metric_type);

-- ============================================================================
-- 7. AUDIT_LOGS TABLE - Compliance & debugging
-- ============================================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  actor_type VARCHAR(50),
  actor_id VARCHAR(255),
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  action VARCHAR(50),
  status VARCHAR(50),
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- 8. RATE_LIMIT_TRACKER TABLE - Track API usage
-- ============================================================================
CREATE TABLE rate_limit_tracker (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint VARCHAR(100),
  request_count INT DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(company_id, api_key_id, endpoint, window_start)
);

CREATE INDEX idx_rate_limit_company_id ON rate_limit_tracker(company_id);
CREATE INDEX idx_rate_limit_api_key_id ON rate_limit_tracker(api_key_id);
CREATE INDEX idx_rate_limit_window ON rate_limit_tracker(window_start, window_end);

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_companies_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_rooms_updated_at
BEFORE UPDATE ON rooms
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_api_keys_updated_at
BEFORE UPDATE ON api_keys
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

INSERT INTO companies (company_id, name, api_key, secret_key, tier)
VALUES (
  'test-company',
  'Test Company',
  'pk_test_1234567890abcdef',
  'sk_test_secret_1234567890abcdef',
  'free'
) ON CONFLICT (company_id) DO NOTHING;

INSERT INTO api_keys (company_id, api_key_hash, name, rate_limit_per_minute)
SELECT 
  id,
  'api_key_hash_placeholder',
  'Default API Key',
  60
FROM companies WHERE company_id = 'test-company'
ON CONFLICT DO NOTHING;

SELECT 'Schema created successfully with UUID' as status;
