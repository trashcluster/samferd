package handlers

import (
	"database/sql"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/trashcluster/samferd/internal/models"
	"golang.org/x/crypto/bcrypt"
)

// Register handler for user registration
func Register(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req models.RegisterRequest
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
			return
		}

		// Hash password
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to hash password"})
			return
		}

		// Insert user
		userID := uuid.New().String()
		query := `INSERT INTO users (id, email, password_hash, full_name, email_verified) 
		          VALUES ($1, $2, $3, $4, false) RETURNING id, email, full_name, email_verified, created_at, updated_at`

		user := models.User{}
		err = db.QueryRow(query, userID, req.Email, hashedPassword, req.FullName).
			Scan(&user.ID, &user.Email, &user.FullName, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt)

		if err != nil {
			if err.Error() == "pq: duplicate key value violates unique constraint \"users_email_key\"" {
				c.JSON(http.StatusConflict, models.ErrorResponse{Error: "email already exists"})
			} else {
				c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to create user"})
			}
			return
		}

		// TODO: Generate and send verification email
		// For now, we'll auto-verify
		db.Exec(`UPDATE users SET email_verified = true WHERE id = $1`, userID)

		c.JSON(http.StatusCreated, user)
	}
}

// Login handler for user login
func Login(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req models.LoginRequest
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
			return
		}

		// Query user
		query := `SELECT id, password_hash, email_verified FROM users WHERE email = $1`
		var userID, passwordHash string
		var emailVerified bool

		err := db.QueryRow(query, req.Email).Scan(&userID, &passwordHash, &emailVerified)
		if err != nil {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "invalid email or password"})
			return
		}

		// Check email verification
		if !emailVerified {
			c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "email not verified"})
			return
		}

		// Compare password
		if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "invalid email or password"})
			return
		}

		// Generate JWT
		jwtSecret := os.Getenv("JWT_SECRET")
		if jwtSecret == "" {
			jwtSecret = "change-me-in-production"
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"user_id": userID,
			"exp":     time.Now().Add(time.Hour * 24).Unix(),
			"iat":     time.Now().Unix(),
		})

		tokenString, err := token.SignedString([]byte(jwtSecret))
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to generate token"})
			return
		}

		// Fetch full user data
		var user models.User
		userQuery := `SELECT id, email, full_name, email_verified, created_at, updated_at FROM users WHERE id = $1`
		db.QueryRow(userQuery, userID).Scan(&user.ID, &user.Email, &user.FullName, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt)

		c.JSON(http.StatusOK, models.LoginResponse{
			Token: tokenString,
			User:  user,
		})
	}
}

// VerifyEmail handler for email verification
func VerifyEmail(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req models.VerifyEmailRequest
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
			return
		}

		// TODO: Implement verification token logic
		c.JSON(http.StatusOK, gin.H{"message": "email verified"})
	}
}

// GetUser handler to get a user by ID
func GetUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("id")

		query := `SELECT id, email, full_name, email_verified, created_at, updated_at FROM users WHERE id = $1`
		var user models.User

		err := db.QueryRow(query, userID).Scan(&user.ID, &user.Email, &user.FullName, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt)
		if err != nil {
			c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "user not found"})
			return
		}

		c.JSON(http.StatusOK, user)
	}
}

// UpdateUser handler to update a user
func UpdateUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("id")

		// TODO: Implement update validation (ensure user can only update themselves)

		var updateReq struct {
			FullName string `json:"full_name"`
		}

		if err := c.BindJSON(&updateReq); err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
			return
		}

		query := `UPDATE users SET full_name = $1, updated_at = CURRENT_TIMESTAMP 
		          WHERE id = $2 RETURNING id, email, full_name, email_verified, created_at, updated_at`

		var user models.User
		err := db.QueryRow(query, updateReq.FullName, userID).
			Scan(&user.ID, &user.Email, &user.FullName, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt)

		if err != nil {
			c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "user not found"})
			return
		}

		c.JSON(http.StatusOK, user)
	}
}

// DeleteUser handler to delete a user
func DeleteUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("id")

		// TODO: Implement delete validation

		result, err := db.Exec(`DELETE FROM users WHERE id = $1`, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to delete user"})
			return
		}

		rowsAffected, err := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "user not found"})
			return
		}

		c.JSON(http.StatusNoContent, nil)
	}
}
