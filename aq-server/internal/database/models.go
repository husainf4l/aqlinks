package database

import (
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Company represents a tenant company
type Company struct {
	ID        uint      `gorm:"primaryKey;autoIncrement"`
	CompanyID string    `gorm:"uniqueIndex;type:varchar(50);not null"`
	Name      string    `gorm:"type:varchar(255);not null"`
	APIKey    string    `gorm:"uniqueIndex;type:varchar(255);not null"`
	SecretKey string    `gorm:"type:varchar(255);not null"`
	Tier      string    `gorm:"type:varchar(50);default:'free'"`
	IsActive  bool      `gorm:"default:true"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
	UpdatedAt time.Time `gorm:"autoUpdateTime"`
	Metadata  datatypes.JSON `gorm:"type:jsonb;default:'{}';serializer:json"`

	// Relations
	Tokens   []Token   `gorm:"foreignKey:CompanyIDFK;references:ID;constraint:OnDelete:CASCADE"`
	Rooms    []Room    `gorm:"foreignKey:CompanyIDFK;references:ID;constraint:OnDelete:CASCADE"`
	Sessions []Session `gorm:"foreignKey:CompanyIDFK;references:ID;constraint:OnDelete:CASCADE"`
	APIKeys  []APIKey  `gorm:"foreignKey:CompanyIDFK;references:ID;constraint:OnDelete:CASCADE"`
}

// Token represents an access token for room access
type Token struct {
	ID          uint      `gorm:"primaryKey;autoIncrement"`
	CompanyIDFK uint      `gorm:"index;not null"`
	CompanyID   string    `gorm:"type:varchar(50);not null;index:,type:btree"`
	TokenHash   string    `gorm:"uniqueIndex;type:varchar(255);not null"`
	RoomID      string    `gorm:"index;type:varchar(255);not null"`
	UserName    string    `gorm:"type:varchar(255);not null"`
	Permissions datatypes.JSON `gorm:"type:jsonb;default:'{\"publish\": true, \"subscribe\": true}';serializer:json"`
	CreatedAt   time.Time `gorm:"autoCreateTime"`
	ExpiresAt   time.Time `gorm:"index"`
	IsUsed      bool      `gorm:"default:false"`
	UsedAt      *time.Time
	Revoked     bool      `gorm:"default:false"`

	// Foreign Key
	Company *Company `gorm:"foreignKey:CompanyIDFK;references:ID;constraint:OnDelete:CASCADE"`
}

// Room represents a video room
type Room struct {
	ID              string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	CompanyID       string    `gorm:"index;type:varchar(50);not null"`
	RoomID          string    `gorm:"index;type:varchar(255);not null"`
	Name            string    `gorm:"type:varchar(255)"`
	Description     string    `gorm:"type:text"`
	MaxParticipants int       `gorm:"default:100"`
	CreatedAt       time.Time `gorm:"autoCreateTime"`
	UpdatedAt       time.Time `gorm:"autoUpdateTime"`
	Metadata        datatypes.JSON `gorm:"type:jsonb;default:'{}';serializer:json"`

	// Unique constraint
	// UniqueIndex not shown here - use migration

	// Foreign Key
	Company *Company `gorm:"foreignKey:CompanyID;references:CompanyID;constraint:OnDelete:CASCADE"`
}

// Session represents an active user session
type Session struct {
	ID             string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	CompanyID      string    `gorm:"index;type:varchar(50);not null"`
	RoomID         string    `gorm:"index;type:varchar(255);not null"`
	UserName       string    `gorm:"type:varchar(255);not null"`
	TokenID        *string   `gorm:"type:uuid"`
	ConnectedAt    time.Time `gorm:"autoCreateTime;index"`
	DisconnectedAt *time.Time
	DurationSeconds int `gorm:"generated:stored"`
	PeerAddress     string `gorm:"type:varchar(100)"`
	Metadata        datatypes.JSON `gorm:"type:jsonb;default:'{}';serializer:json"`

	// Foreign Keys
	Company *Company `gorm:"foreignKey:CompanyID;references:CompanyID;constraint:OnDelete:CASCADE"`
	Token   *Token   `gorm:"foreignKey:TokenID;references:ID;constraint:OnDelete:SET NULL"`
}

// APIKey represents an API key for rate limiting
type APIKey struct {
	ID                 string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	CompanyID          string    `gorm:"index;type:varchar(50);not null"`
	APIKeyHash         string    `gorm:"uniqueIndex;type:varchar(255);not null"`
	Name               string    `gorm:"type:varchar(100)"`
	IsActive           bool      `gorm:"default:true"`
	RateLimitPerMinute int       `gorm:"default:60"`
	CreatedAt          time.Time `gorm:"autoCreateTime"`
	UpdatedAt          time.Time `gorm:"autoUpdateTime"`

	// Foreign Key
	Company *Company `gorm:"foreignKey:CompanyID;references:CompanyID;constraint:OnDelete:CASCADE"`
}

// AuditLog represents audit log entries
type AuditLog struct {
	ID           string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	CompanyID    *string   `gorm:"index;type:varchar(50)"`
	EventType    string    `gorm:"index;type:varchar(50);not null"`
	ActorType    string    `gorm:"type:varchar(50)"`
	ActorID      string    `gorm:"type:varchar(255)"`
	ResourceType string    `gorm:"type:varchar(50)"`
	ResourceID   string    `gorm:"type:varchar(255)"`
	Action       string    `gorm:"type:varchar(50)"`
	Status       string    `gorm:"type:varchar(50)"`
	Details      datatypes.JSON `gorm:"type:jsonb;default:'{}';serializer:json"`
	CreatedAt    time.Time `gorm:"autoCreateTime;index"`
}

// RateLimitTracker tracks API usage
type RateLimitTracker struct {
	ID         string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	CompanyID  string    `gorm:"index;type:varchar(50);not null"`
	APIKeyID   string    `gorm:"index;type:uuid;not null"`
	Endpoint   string    `gorm:"type:varchar(100)"`
	RequestCount int     `gorm:"default:1"`
	WindowStart time.Time `gorm:"index"`
	WindowEnd   time.Time `gorm:"index"`
}

// Legacy models for backward compatibility (kept for reference)
// These are replaced by GORM models above

// TokenRequest represents a generated token (deprecated - use Token instead)
type TokenRequest struct {
	ID        int       `db:"id"`
	CompanyID string    `db:"company_id"`
	TokenHash string    `db:"token_hash"`
	RoomID    string    `db:"room_id"`
	UserName  string    `db:"user_name"`
	CreatedAt time.Time `db:"created_at"`
	ExpiresAt time.Time `db:"expires_at"`
	Used      bool      `db:"used"`
}

// GetCompanyByAPIKey retrieves company by API key
func GetCompanyByAPIKey(apiKey string) (*Company, error) {
	company := &Company{}
	result := DB.Where("api_key = ?", apiKey).First(company)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, result.Error
	}
	return company, nil
}

// GetCompanyByID retrieves company by company ID
func GetCompanyByID(companyID string) (*Company, error) {
	company := &Company{}
	result := DB.Where("company_id = ?", companyID).First(company)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, result.Error
	}
	return company, nil
}

// CreateToken stores a new token
func CreateToken(token *Token) error {
	return DB.Create(token).Error
}

// GetToken retrieves token by hash
func GetToken(tokenHash string) (*Token, error) {
	token := &Token{}
	result := DB.Where("token_hash = ?", tokenHash).First(token)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, result.Error
	}
	return token, nil
}

// MarkTokenUsed marks a token as used
func MarkTokenUsed(tokenHash string) error {
	return DB.Model(&Token{}).Where("token_hash = ?", tokenHash).Update("is_used", true).Update("used_at", time.Now()).Error
}

// CreateSession creates a new session record
func CreateSession(session *Session) error {
	return DB.Create(session).Error
}

// CloseSession closes a session
func CloseSession(companyID, roomID, userName string) error {
	return DB.Model(&Session{}).
		Where("company_id = ? AND room_id = ? AND user_name = ? AND disconnected_at IS NULL", companyID, roomID, userName).
		Update("disconnected_at", time.Now()).Error
}

// GetActiveSessionCount returns the number of active sessions in a room
func GetActiveSessionCount(companyID, roomID string) (int64, error) {
	var count int64
	result := DB.Model(&Session{}).
		Where("company_id = ? AND room_id = ? AND disconnected_at IS NULL", companyID, roomID).
		Count(&count)
	return count, result.Error
}
