package models

import "time"

// TransportType enum
type TransportType string

const (
	Flight TransportType = "flight"
	Bus    TransportType = "bus"
	Car    TransportType = "car"
	Boat   TransportType = "boat"
)

// User represents a user in the system
type User struct {
	ID            string    `json:"id"`
	Email         string    `json:"email"`
	PasswordHash  string    `json:"-"`
	FullName      string    `json:"full_name"`
	EmailVerified bool      `json:"email_verified"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// Event represents a travel event
type Event struct {
	ID                   string   `json:"id"`
	Title                string   `json:"title"`
	Description          string   `json:"description"`
	Location             string   `json:"location"`
	StartDate            time.Time `json:"start_date"`
	EndDate              time.Time `json:"end_date"`
	AvailableTransports  []string `json:"available_transports"` // JSON array: flight, bus, car, boat
	CreatedByAdminID     string   `json:"created_by_admin_id"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

// Registration represents a user's registration for an event
type Registration struct {
	ID               string            `json:"id"`
	UserID           string            `json:"user_id"`
	EventID          string            `json:"event_id"`
	TransportType    TransportType     `json:"transport_type"`
	BookingReference string            `json:"booking_reference"`
	BookingDetails   map[string]interface{} `json:"booking_details"` // JSON: seat, airline, departure time, etc.
	BookingDate      time.Time         `json:"booking_date"`
	CreatedAt        time.Time         `json:"created_at"`
	UpdatedAt        time.Time         `json:"updated_at"`
}

// Admin represents admin role
type Admin struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// Request/Response DTOs

// RegisterRequest for user registration
type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	FullName string `json:"full_name" binding:"required"`
}

// LoginRequest for user login
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse after successful login
type LoginResponse struct {
	Token  string `json:"token"`
	User   User   `json:"user"`
}

// VerifyEmailRequest for email verification
type VerifyEmailRequest struct {
	Token string `json:"token" binding:"required"`
}

// CreateEventRequest for admin event creation
type CreateEventRequest struct {
	Title               string    `json:"title" binding:"required"`
	Description         string    `json:"description"`
	Location            string    `json:"location" binding:"required"`
	StartDate           time.Time `json:"start_date" binding:"required"`
	EndDate             time.Time `json:"end_date" binding:"required"`
	AvailableTransports []string  `json:"available_transports" binding:"required"`
}

// UpdateEventRequest for updating an event
type UpdateEventRequest struct {
	Title               string    `json:"title"`
	Description         string    `json:"description"`
	Location            string    `json:"location"`
	StartDate           time.Time `json:"start_date"`
	EndDate             time.Time `json:"end_date"`
	AvailableTransports []string  `json:"available_transports"`
}

// RegisterForEventRequest for user event registration
type RegisterForEventRequest struct {
	TransportType    TransportType             `json:"transport_type" binding:"required"`
	BookingReference string                    `json:"booking_reference"`
	BookingDetails   map[string]interface{} `json:"booking_details"`
}

// UpdateRegistrationRequest for updating a registration
type UpdateRegistrationRequest struct {
	TransportType    TransportType             `json:"transport_type"`
	BookingReference string                    `json:"booking_reference"`
	BookingDetails   map[string]interface{} `json:"booking_details"`
}

// Error response
type ErrorResponse struct {
	Error string `json:"error"`
}
