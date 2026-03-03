# Samferd Docker Compose Configuration

## Quick Start (30 seconds)

```bash
docker-compose up -d
```

That's it! Access your app:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8080
- Database: localhost:5432

**Everything is self-contained. No .env files needed!**

## What Gets Started

1. **PostgreSQL Database** - Auto-initialized with all tables
2. **Go Backend API** - REST API server
3. **Vue.js Frontend** - Web application
4. **Internal Network** - Secure service-to-service communication
5. **Data Persistence** - `postgres_data` volume keeps your data even if containers stop

## Configuration

All settings are in `docker-compose.yml`. Common changes:

### Change Port Numbers
Edit `docker-compose.yml`:
```yaml
frontend:
  ports:
    - "3001:3000"  # Changed from 3000 to 3001

backend:
  ports:
    - "8081:8080"  # Changed from 8080 to 8081
```

### Change Database Password
Edit `docker-compose.yml`:
```yaml
postgres:
  environment:
    POSTGRES_PASSWORD: your_new_password
    
backend:
  environment:
    DB_PASSWORD: your_new_password
```

### Change API URL (for production)
Edit `docker-compose.yml`:
```yaml
frontend:
  environment:
    VITE_API_BASE_URL: https://api.yourdomain.com
```

### Change JWT Secret (for production)
Edit `docker-compose.yml`:
```yaml
backend:
  environment:
    JWT_SECRET: your-long-random-secret-key-32-characters-minimum
    FRONTEND_URL: https://yourdomain.com
```

## Available Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres

# Restart services
docker-compose restart

# Remove everything including volumes (WARNING: deletes all data!)
docker-compose down -v

# Rebuild images locally
docker-compose build

# Pull latest images from GitHub Container Registry
docker-compose pull
docker-compose up -d

# Check service status
docker-compose ps

# View resource usage
docker stats

# Enter a container shell
docker-compose exec backend sh
docker-compose exec frontend sh
docker-compose exec postgres psql -U postgres
```

## First Time Setup

```bash
# 1. Start services
docker-compose up -d

# 2. Wait for database to be ready (check "healthy" status)
docker-compose ps

# 3. (Optional) Create an admin user
docker-compose exec postgres psql -U postgres -d samferd -c \
  "INSERT INTO admins (user_id) VALUES ((SELECT id FROM users WHERE email = 'your-email@example.com'));"

# 4. Access frontend at http://localhost:3000
```

## Service Configuration Details

### PostgreSQL Service
```yaml
postgres:
  environment:
    POSTGRES_USER: postgres                    # Username
    POSTGRES_PASSWORD: postgres_local_dev_password  # Default password
    POSTGRES_DB: samferd                       # Database name
```

**⚠️ Production:** Change `POSTGRES_PASSWORD` to a strong random string!

### Backend Service
```yaml
backend:
  environment:
    DB_HOST: postgres                          # Docker hostname
    DB_PORT: 5432                              # PostgreSQL port
    DB_USER: postgres                          # Database username
    DB_PASSWORD: postgres_local_dev_password   # Must match DB password
    DB_NAME: samferd                           # Database name
    JWT_SECRET: dev-secret-key-change-in-production-...
    FRONTEND_URL: http://localhost:3000        # For CORS & links
    SMTP_HOST: smtp.gmail.com                  # Email (optional)
    SMTP_PORT: 587
    SMTP_USER: noreply@example.com
    SMTP_PASSWORD: ""
    SMTP_FROM: noreply@example.com
```

**⚠️ Production:** 
- Change `JWT_SECRET` to random 32+ character string
- Update `FRONTEND_URL` to your actual domain
- Configure SMTP for email verification

### Frontend Service
```yaml
frontend:
  environment:
    VITE_API_BASE_URL: http://localhost:8080  # Backend API URL
```

**⚠️ Production:** Change to your production API URL

## Troubleshooting

### Database connection failed
```bash
# Check if postgres is running and healthy
docker-compose ps postgres

# View postgres logs for errors
docker-compose logs postgres

# Ensure passwords match in all services
# postgres POSTGRES_PASSWORD must equal backend DB_PASSWORD
```

### Backend won't start
```bash
# Check logs
docker-compose logs backend

# Ensure database is healthy
docker-compose ps postgres  # Should show "healthy"

# Restart both
docker-compose restart postgres backend
```

### Frontend can't reach API
```bash
# Verify backend is running
docker-compose logs backend

# Test API connectivity
curl http://localhost:8080/api/events

# Check VITE_API_BASE_URL matches your setup
docker-compose config | grep VITE_API_BASE_URL
```

### Port already in use
Edit `docker-compose.yml` and change port mappings:
```yaml
frontend:
  ports:
    - "3001:3000"  # External port 3001 → Internal port 3000

backend:
  ports:
    - "8081:8080"  # External port 8081 → Internal port 8080

postgres:
  ports:
    - "5433:5432"  # External port 5433 → Internal port 5432
```

### Need to reset database
```bash
# WARNING: This deletes all data!
docker-compose down -v
docker-compose up -d
```

### Check data persistence
```bash
# List volumes
docker volume ls | grep samferd

# Inspect postgres_data volume
docker volume inspect samferd_postgres_data
```

## Production Deployment

### Security Checklist
- [ ] Change `POSTGRES_PASSWORD` to strong random value
- [ ] Change `JWT_SECRET` to strong random value (32+ chars)
- [ ] Update `FRONTEND_URL` to production domain
- [ ] Update `VITE_API_BASE_URL` to production API URL
- [ ] Configure SMTP for email (SendGrid, AWS SES, Gmail)
- [ ] Enable HTTPS (use Nginx reverse proxy with Let's Encrypt)
- [ ] Set up firewall to restrict ports
- [ ] Use managed PostgreSQL database (AWS RDS) for production
- [ ] Set up automated backups
- [ ] Configure monitoring and logging

### For Production
```bash
# Generate random JWT secret
openssl rand -base64 32

# Generate random DB password
openssl rand -base64 32

# Update docker-compose.yml with production values
# Then deploy
docker-compose up -d
```

## Data Backup & Restore

### Backup Database
```bash
docker-compose exec postgres pg_dump -U postgres samferd > backup.sql
```

### Restore from Backup
```bash
docker-compose exec postgres psql -U postgres samferd < backup.sql
```

### Backup Entire Data Volume
```bash
docker run --rm -v samferd_postgres_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/samferd-backup.tar.gz -C /data .
```

### Restore Data Volume
```bash
docker run --rm -v samferd_postgres_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/samferd-backup.tar.gz -C /data
```

## Performance Tuning

### Increase Memory Limits
Edit `docker-compose.yml`:
```yaml
backend:
  deploy:
    resources:
      limits:
        cpus: '1'
        memory: 512M
      reservations:
        cpus: '0.5'
        memory: 256M

postgres:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 1G
```

### Scale Frontend Services (advanced)
```bash
docker-compose up -d --scale frontend=3
```

(Requires load balancer setup)

## Docker Compose Network

All services communicate on the internal `samferd-network` bridge:
- Services can reach each other by hostname: `postgres`, `backend`, `frontend`
- External world cannot directly access services (secure!)
- Port mappings expose services to localhost

## Volume Persistence

The `postgres_data` volume:
- Persists database across container restarts
- Survives `docker-compose down` (data is NOT deleted)
- Only deleted with `docker-compose down -v`
- Located in Docker's data directory

---

**See Also:**
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deploy to cloud platforms
- [GITHUB_ACTIONS.md](GITHUB_ACTIONS.md) - CI/CD pipeline
- [PLAN.md](PLAN.md) - Architecture details
- [README.md](README.md) - General project info
