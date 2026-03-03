package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/trashcluster/samferd/internal/models"
)

// RegisterForEvent handler for user to register for an event
func RegisterForEvent(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("user_id")
		eventID := c.Param("eventID")

		var req models.RegisterForEventRequest
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
			return
		}

		registrationID := uuid.New().String()
		bookingDetailsJSON, _ := json.Marshal(req.BookingDetails)

		query := `INSERT INTO registrations (id, user_id, event_id, transport_type, booking_reference, booking_details, booking_date)
		          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
		          RETURNING id, user_id, event_id, transport_type, booking_reference, booking_details, booking_date, created_at, updated_at`

		var registration models.Registration
		var bookingDetails string

		err := db.QueryRow(query, registrationID, userID, eventID, req.TransportType, req.BookingReference, bookingDetailsJSON).
			Scan(&registration.ID, &registration.UserID, &registration.EventID, &registration.TransportType, &registration.BookingReference, &bookingDetails, &registration.BookingDate, &registration.CreatedAt, &registration.UpdatedAt)

		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to register for event"})
			return
		}

		json.Unmarshal([]byte(bookingDetails), &registration.BookingDetails)

		c.JSON(http.StatusCreated, registration)
	}
}

// UpdateRegistration handler to update a registration
func UpdateRegistration(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: Validate user ownership of registration
		registrationID := c.Param("id")

		var req models.UpdateRegistrationRequest
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
			return
		}

		bookingDetailsJSON, _ := json.Marshal(req.BookingDetails)

		query := `UPDATE registrations SET transport_type = COALESCE($1, transport_type),
		          booking_reference = COALESCE($2, booking_reference),
		          booking_details = COALESCE($3, booking_details),
		          updated_at = CURRENT_TIMESTAMP
		          WHERE id = $4
		          RETURNING id, user_id, event_id, transport_type, booking_reference, booking_details, booking_date, created_at, updated_at`

		var registration models.Registration
		var bookingDetails string

		err := db.QueryRow(query, req.TransportType, req.BookingReference, bookingDetailsJSON, registrationID).
			Scan(&registration.ID, &registration.UserID, &registration.EventID, &registration.TransportType, &registration.BookingReference, &bookingDetails, &registration.BookingDate, &registration.CreatedAt, &registration.UpdatedAt)

		if err != nil {
			c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "registration not found"})
			return
		}

		json.Unmarshal([]byte(bookingDetails), &registration.BookingDetails)

		c.JSON(http.StatusOK, registration)
	}
}

// DeleteRegistration handler to delete a registration
func DeleteRegistration(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: Validate user ownership of registration
		registrationID := c.Param("id")

		result, err := db.Exec(`DELETE FROM registrations WHERE id = $1`, registrationID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to delete registration"})
			return
		}

		rowsAffected, err := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "registration not found"})
			return
		}

		c.JSON(http.StatusNoContent, nil)
	}
}
