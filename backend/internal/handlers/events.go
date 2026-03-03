package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/trashcluster/samferd/internal/models"
)

// CreateEvent handler for creating an event (admin only)
func CreateEvent(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: Validate admin role
		userID, _ := c.Get("user_id")

		var req models.CreateEventRequest
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
			return
		}

		eventID := uuid.New().String()
		transportsJSON, _ := json.Marshal(req.AvailableTransports)

		query := `INSERT INTO events (id, title, description, location, start_date, end_date, available_transports, created_by_admin_id)
		          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		          RETURNING id, title, description, location, start_date, end_date, available_transports, created_by_admin_id, created_at, updated_at`

		var event models.Event
		var transportsStr string

		err := db.QueryRow(query, eventID, req.Title, req.Description, req.Location, req.StartDate, req.EndDate, transportsJSON, userID).
			Scan(&event.ID, &event.Title, &event.Description, &event.Location, &event.StartDate, &event.EndDate, &transportsStr, &event.CreatedByAdminID, &event.CreatedAt, &event.UpdatedAt)

		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to create event"})
			return
		}

		json.Unmarshal([]byte(transportsStr), &event.AvailableTransports)

		c.JSON(http.StatusCreated, event)
	}
}

// GetEvents handler to list all events
func GetEvents(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		query := `SELECT id, title, description, location, start_date, end_date, available_transports, created_by_admin_id, created_at, updated_at 
		          FROM events ORDER BY start_date ASC`

		rows, err := db.Query(query)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to fetch events"})
			return
		}
		defer rows.Close()

		var events []models.Event
		for rows.Next() {
			var event models.Event
			var transportsStr string

			err := rows.Scan(&event.ID, &event.Title, &event.Description, &event.Location, &event.StartDate, &event.EndDate, &transportsStr, &event.CreatedByAdminID, &event.CreatedAt, &event.UpdatedAt)
			if err != nil {
				continue
			}

			json.Unmarshal([]byte(transportsStr), &event.AvailableTransports)
			events = append(events, event)
		}

		c.JSON(http.StatusOK, events)
	}
}

// GetEventByID handler to get a specific event
func GetEventByID(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		eventID := c.Param("id")

		query := `SELECT id, title, description, location, start_date, end_date, available_transports, created_by_admin_id, created_at, updated_at 
		          FROM events WHERE id = $1`

		var event models.Event
		var transportsStr string

		err := db.QueryRow(query, eventID).
			Scan(&event.ID, &event.Title, &event.Description, &event.Location, &event.StartDate, &event.EndDate, &transportsStr, &event.CreatedByAdminID, &event.CreatedAt, &event.UpdatedAt)

		if err != nil {
			c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "event not found"})
			return
		}

		json.Unmarshal([]byte(transportsStr), &event.AvailableTransports)

		c.JSON(http.StatusOK, event)
	}
}

// UpdateEvent handler for updating an event (admin only)
func UpdateEvent(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: Validate admin role
		eventID := c.Param("id")

		var req models.UpdateEventRequest
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
			return
		}

		// TODO: Implement dynamic update based on non-nil fields

		transportsJSON, _ := json.Marshal(req.AvailableTransports)

		query := `UPDATE events SET title = COALESCE($1, title), 
		          description = COALESCE($2, description),
		          location = COALESCE($3, location),
		          start_date = COALESCE($4, start_date),
		          end_date = COALESCE($5, end_date),
		          available_transports = COALESCE($6, available_transports),
		          updated_at = CURRENT_TIMESTAMP
		          WHERE id = $7
		          RETURNING id, title, description, location, start_date, end_date, available_transports, created_by_admin_id, created_at, updated_at`

		var event models.Event
		var transportsStr string

		err := db.QueryRow(query, req.Title, req.Description, req.Location, req.StartDate, req.EndDate, transportsJSON, eventID).
			Scan(&event.ID, &event.Title, &event.Description, &event.Location, &event.StartDate, &event.EndDate, &transportsStr, &event.CreatedByAdminID, &event.CreatedAt, &event.UpdatedAt)

		if err != nil {
			c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "event not found"})
			return
		}

		json.Unmarshal([]byte(transportsStr), &event.AvailableTransports)

		c.JSON(http.StatusOK, event)
	}
}

// DeleteEvent handler for deleting an event (admin only)
func DeleteEvent(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: Validate admin role
		eventID := c.Param("id")

		result, err := db.Exec(`DELETE FROM events WHERE id = $1`, eventID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to delete event"})
			return
		}

		rowsAffected, err := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "event not found"})
			return
		}

		c.JSON(http.StatusNoContent, nil)
	}
}

// GetEventRegistrations handler to get all registrations for an event
func GetEventRegistrations(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		eventID := c.Param("id")

		query := `SELECT r.id, r.user_id, r.event_id, r.transport_type, r.booking_reference, r.booking_details, r.booking_date, u.full_name, u.email
		          FROM registrations r
		          JOIN users u ON r.user_id = u.id
		          WHERE r.event_id = $1
		          ORDER BY r.transport_type, u.full_name`

		rows, err := db.Query(query, eventID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to fetch registrations"})
			return
		}
		defer rows.Close()

		type RegistrationWithUser struct {
			models.Registration
			UserFullName string `json:"user_full_name"`
			UserEmail    string `json:"user_email"`
		}

		var registrations []RegistrationWithUser
		for rows.Next() {
			var reg RegistrationWithUser
			var bookingDetails string

			err := rows.Scan(&reg.ID, &reg.UserID, &reg.EventID, &reg.TransportType, &reg.BookingReference, &bookingDetails, &reg.BookingDate, &reg.UserFullName, &reg.UserEmail)
			if err != nil {
				continue
			}

			json.Unmarshal([]byte(bookingDetails), &reg.BookingDetails)
			registrations = append(registrations, reg)
		}

		c.JSON(http.StatusOK, registrations)
	}
}
