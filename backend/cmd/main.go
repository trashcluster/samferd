package main

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/trashcluster/samferd/internal/db"
	"github.com/trashcluster/samferd/internal/handlers"
	"github.com/trashcluster/samferd/internal/middleware"
	"github.com/gin-gonic/gin"
)

func init() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}
}

func main() {
	// Initialize database
	database, err := db.InitDB()
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Create tables
	if err := db.CreateTables(database); err != nil {
		log.Fatalf("Failed to create tables: %v", err)
	}

	// Setup Gin router
	router := gin.Default()

	// Middleware
	router.Use(middleware.CORSMiddleware())

	// Public routes (Auth)
	auth := router.Group("/api/auth")
	{
		auth.POST("/register", handlers.Register(database))
		auth.POST("/login", handlers.Login(database))
		auth.POST("/verify-email", handlers.VerifyEmail(database))
	}

	// Protected routes
	protected := router.Group("/api")
	protected.Use(middleware.AuthMiddleware())
	{
		// User routes
		user := protected.Group("/users")
		{
			user.GET("/:id", handlers.GetUser(database))
			user.PUT("/:id", handlers.UpdateUser(database))
			user.DELETE("/:id", handlers.DeleteUser(database))
		}

		// Event routes
		events := protected.Group("/events")
		{
			events.GET("", handlers.GetEvents(database))
			events.POST("", handlers.CreateEvent(database)) // Admin only
			events.GET("/:id", handlers.GetEventByID(database))
			events.PUT("/:id", handlers.UpdateEvent(database)) // Admin only
			events.DELETE("/:id", handlers.DeleteEvent(database)) // Admin only
			events.GET("/:id/registrations", handlers.GetEventRegistrations(database))
		}

		// Registration routes
		regs := protected.Group("/registrations")
		{
			regs.POST("/:eventID", handlers.RegisterForEvent(database))
			regs.PUT("/:id", handlers.UpdateRegistration(database))
			regs.DELETE("/:id", handlers.DeleteRegistration(database))
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Starting server on port %s\n", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
