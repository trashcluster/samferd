# Samferd - Travel Coordination Web App

## Project Overview

Samferd (Old Norse: "journey together") is a web application for coordinating group travel via multiple transportation modes (flight, bus, car, boat). Features an intuitive calendar view, user registration with email verification, and an admin interface for event management.

## Tech Stack

- **Backend**: Go with Gin framework + PostgreSQL
- **Frontend**: Vue.js 3 + Vite
- **Authentication**: JWT tokens with email verification
- **Database**: PostgreSQL with proper indexing and constraints

## Architecture

### Backend Structure
```
backend/
├── cmd/
│   └── main.go          # Application entry point
├── internal/
│   ├── db/
│   │   └── db.go        # Database initialization & migrations
│   ├── handlers/
│   │   ├── auth.go      # Authentication endpoints (register, login, verify)
│   │   ├── events.go    # Event management (CRUD)
│   │   └── registrations.go  # User event registrations
│   ├── middleware/
│   │   └── middleware.go # JWT auth, CORS middleware
│   └── models/
│       └── models.go    # Data structures & request/response DTOs
├── config/
│   └── .env.example     # Environment configuration template
└── go.mod
```

### Frontend Structure
```
frontend/
├── src/
│   ├── views/
│   │   ├── HomePage.vue           # Calendar view + upcoming events
│   │   ├── EventDetailPage.vue    # Event details + registrations + user registration form
│   │   ├── LoginPage.vue          # User login
│   │   ├── RegisterPage.vue       # User registration
│   │   ├── ProfilePage.vue        # User profile & registration history
│   │   ├── VerifyEmailPage.vue    # Email verification landing
│   │   └── AdminPage.vue          # Admin event creation & management
│   ├── services/
│   │   └── api.js       # Axios API client with request/response interceptors
│   ├── stores/
│   │   ├── auth.js      # Pinia auth store (login, logout, session)
│   │   └── event.js     # Pinia event store (events, registrations)
│   ├── router/
│   │   └── index.js     # Vue Router configuration with auth guards
│   ├── App.vue          # Root component (navbar, routing)
│   ├── main.js          # Vue app initialization
│   └── style.css        # Global styles
├── index.html
├── vite.config.js
└── package.json
```

## Database Schema

### Users Table
- `id` (UUID, PK)
- `email` (VARCHAR, UNIQUE)
- `password_hash` (VARCHAR)
- `full_name` (VARCHAR)
- `email_verified` (BOOLEAN)
- `created_at`, `updated_at` (TIMESTAMP)

### Events Table
- `id` (UUID, PK)
- `title` (VARCHAR)
- `description` (TEXT)
- `location` (VARCHAR)
- `start_date`, `end_date` (TIMESTAMP)
- `available_transports` (JSONB) - Array: ["flight", "bus", "car", "boat"]
- `created_by_admin_id` (UUID, FK → users)
- `created_at`, `updated_at` (TIMESTAMP)

### Registrations Table
- `id` (UUID, PK)
- `user_id` (UUID, FK → users)
- `event_id` (UUID, FK → events)
- `transport_type` (VARCHAR) - Enum: flight, bus, car, boat
- `booking_reference` (VARCHAR) - e.g., flight number, bus company
- `booking_details` (JSONB) - Flexible JSON: {seat, airline, departure_time, etc.}
- `booking_date` (TIMESTAMP)
- `created_at`, `updated_at` (TIMESTAMP)
- **Unique constraint**: (user_id, event_id)

### Admins Table
- `id` (UUID, PK)
- `user_id` (UUID, FK → users, UNIQUE)
- `created_at` (TIMESTAMP)

### Email Verification Tokens Table
- `id` (UUID, PK)
- `user_id` (UUID, FK → users, UNIQUE)
- `token` (VARCHAR, UNIQUE)
- `expires_at` (TIMESTAMP)
- `created_at` (TIMESTAMP)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user, returns JWT token
- `POST /api/auth/verify-email` - Verify email with token

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update user profile
- `DELETE /api/users/:id` - Delete user account

### Events
- `GET /api/events` - List all events (paginated)
- `POST /api/events` - Create event (admin only)
- `GET /api/events/:id` - Get event details
- `PUT /api/events/:id` - Update event (admin only)
- `DELETE /api/events/:id` - Delete event (admin only)
- `GET /api/events/:id/registrations` - List registrations for event with user details

### Registrations
- `POST /api/registrations/:eventID` - Register user for event
- `PUT /api/registrations/:id` - Update registration (change transport, booking details)
- `DELETE /api/registrations/:id` - Cancel registration

## Key Features

### User-Facing Features
1. **Calendar View Dashboard**
   - Month/week view of all events
   - Visual indicators for registered vs. unregistered events
   - Click event to see details and participant list

2. **Event Registration**
   - Select transportation mode (flight, bus, car, boat)
   - Enter booking reference (flight number, bus company, etc.)
   - Add flexible booking details as JSON (seat, airline, departure time, etc.)
   - Update registration anytime before event
   - View all participants grouped by transportation type

3. **User Profile**
   - Edit full name
   - View email verification status
   - See registration history with event details
   - Download/export trip itinerary (future enhancement)

4. **Email Verification**
   - Required before accessing platform
   - OAuth integration optional (future)

### Admin Features
1. **Event Management**
   - Create events with title, description, location, dates
   - Select available transportation modes
   - Edit/delete events
   - View total registrations per event
   - Export participant lists by transport type

2. **User Management**
   - View all registered users
   - See email verification status
   - Optional: Disable/ban accounts

## Implementation Progress

### Backend (Ready for Implementation)
- [x] Project structure created
- [x] Go module initialized
- [x] Database schema designed
- [x] Models defined with DTOs
- [x] Middleware (auth, CORS) scaffolded
- [x] Handlers scaffolded (auth, events, registrations)
- [ ] Email integration (SendGrid/SMTP)
- [ ] Input validation & error handling
- [ ] Database transaction support
- [ ] Admin role integration
- [ ] Rate limiting
- [ ] Logging

### Frontend (Ready for Implementation)
- [x] Project structure created
- [x] Vue 3 + Router setup
- [x] Pinia stores (auth, event) scaffolded
- [x] API client setup with interceptors
- [x] All view components created
- [x] Global styles
- [ ] CSS responsive refinement
- [ ] Calendar library integration (optional)
- [ ] Form validation
- [ ] Loading states & error boundaries
- [ ] Unit tests
- [ ] E2E tests

## Development Workflow

### Setup Backend
```bash
cd backend
# Copy environment configuration
cp config/.env.example .env
# Edit .env with your database credentials

# Install dependencies
go mod download

# Run server (requires PostgreSQL running)
go run cmd/main.go
```

### Setup Frontend
```bash
cd frontend
npm install

# Start dev server (http://localhost:3000)
npm run dev

# Build for production
npm run build
```

### Database Setup
```bash
# Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE samferd;"

# Tables are auto-created on first backend startup
```

## Testing Workflow

### Manual Testing
1. Register account → verify email
2. Create event as admin → verify appears in calendar
3. Register for event as user
4. Change transport/booking details
5. View event details → confirm others' registrations visible

### Validation Targets
- Email unique constraint
- Password minimum length (8 chars)
- Transport type selection mandatory
- Event date relationships (start < end)
- User can only modify own registrations

## Deployment

### Backend (Recommended: Railway, Fly.io, or Heroku)
```bash
# Set environment variables in platform
DB_HOST=<postgres-url>
JWT_SECRET=<strong-secret>
FRONTEND_URL=<frontend-site>

git push heroku main  # or equivalent for chosen platform
```

### Frontend (Recommended: Vercel, Netlify)
```bash
# Set environment variable
VITE_API_BASE_URL=https://api.samferd.com

npm run build
# Deploy dist/ folder
```

### Database (Managed PostgreSQL)
- Use cloud provider's managed PostgreSQL
- Automatic backups enabled
- Connection pooling configured

## Future Enhancements

1. **Real Booking Integration**
   - Amadeus API for flights
   - Busbud or similar for buses
   - Boat ticketing APIs

2. **Advanced Features**
   - Email notifications for event updates
   - Group messaging/chat
   - Itinerary sharing (PDF export)
   - Cost splitting & payment integration
   - Mobile apps (React Native/Flutter)
   - Real-time notifications (WebSocket)

3. **Analytics**
   - Event attendance tracking
   - Popular routes/destinations
   - User engagement metrics

4. **Accessibility**
   - Internationalization (i18n)
   - Dark mode
   - Screen reader optimization

## Notes

- MVP prioritizes coordination over live booking integration
- Email verification auto-enabled in MVP (replace with actual SMTP in production)
- Admin role assigned manually via database inserts initially
- Frontend and backend can be deployed independently
- JWT tokens expire in 24 hours (configurable)
