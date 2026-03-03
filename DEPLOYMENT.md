# Deployment Guide for Samferd

Quick guide to deploy Samferd using Docker and GitHub Actions.

## 🚀 5-Minute Deployment

### Option 1: Deploy Anywhere with Docker Compose (Recommended)

```bash
# 1. Clone repository
git clone https://github.com/trashclyster/[repo-name].git
cd sammerd

# 2. Create environment config
cp .env.example .env

# 3. Edit .env with your settings (optional)
nano .env

# 4. Start all services
docker-compose up -d

# 5. Access app
# Frontend: http://your-server:3000
# API: http://your-server:8080
```

**That's it!** Everything runs automatically.

### Option 2: Deploy on Popular Platforms

#### **Heroku** (free tier available)
```bash
heroku container:login
heroku create my-samferd
heroku stack:set container
git push heroku main
```

#### **Railway.app** (simple, $5/month starter)
```bash
railway login
railway init
railway up
```

#### **Render.com** (easy GitHub integration)
1. Connect your GitHub account
2. Create new "Blueprint" deployment
3. Select `docker-compose.yml`
4. Done!

#### **AWS** (Docker Compose on EC2)
```bash
# On EC2 instance:
sudo apt-get install docker.io docker-compose
git clone <your-repo>
cd sammerd
docker-compose up -d
```

#### **DigitalOcean App Platform**
1. Connect GitHub repo
2. Create new app
3. Service 1: Backend (run `backend/cmd/main.go`)
4. Service 2: Frontend (run `npm run build`)
5. Service 3: PostgreSQL
6. Deploy!

---

## 🔧 Prerequisites

### For any deployment platform:
- ✅ Docker & Docker Compose (most platforms provide these)
- ✅ Your GitHub account (for pulling images)
- ✅ Database (PostgreSQL, auto-created by Docker Compose)

### That's literally it!

---

## 📋 Quick Reference

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### View Logs
```bash
docker-compose logs -f
```

### Check Status
```bash
docker-compose ps
```

### Reset Database
```bash
docker-compose down -v  # WARNING: Deletes all data!
docker-compose up -d
```

---

## 🌐 Accessing Your Deployment

### Local/VPS:
- Frontend: `http://localhost:3000`
- API: `http://localhost:8080`

### With Custom Domain:
Set up nginx or Caddy reverse proxy:

```nginx
server {
    listen 80;
    server_name samberd.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location /api {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
    }
}
```

---

## 🔒 Security Checklist

- [ ] Change `JWT_SECRET` in `.env` to random 32+ char string
- [ ] Change `DB_PASSWORD` to strong password
- [ ] Set `FRONTEND_URL` to your actual domain
- [ ] Enable HTTPS (Let's Encrypt, free)
- [ ] Configure firewall to only allow ports 80, 443
- [ ] Regular backups of `postgres_data` volume
- [ ] Update Docker images monthly (`docker-compose pull`)

---

## 📊 Monitoring

### View container status
```bash
docker stats
```

### View application logs
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### Database connection check
```bash
docker-compose exec postgres psql -U postgres -d samberd -c "SELECT 1;"
```

---

## 💾 Backups

### Backup database
```bash
docker-compose exec postgres pg_dump -U postgres samberd > backup.sql
```

### Restore from backup
```bash
docker-compose exec postgres psql -U postgres samberd < backup.sql
```

### Backup entire data volume
```bash
docker run --rm -v samberd_postgres_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/samberd-backup.tar.gz -C /data .

# Restore
docker run --rm -v samberd_postgres_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/samberd-backup.tar.gz -C /data
```

---

## 🆘 Troubleshooting

### Services won't start
```bash
# Check logs
docker-compose logs

# Rebuild images
docker-compose build

# Restart
docker-compose restart
```

### Database connection issues
```bash
# Check postgres is healthy
docker-compose ps postgres

# View postgres logs
docker-compose logs postgres

# Restart postgres
docker-compose restart postgres
```

### Frontend can't reach API
```bash
# Check backend is running
curl http://localhost:8080/api/events

# If fails, check logs
docker-compose logs backend

# Verify VITE_API_BASE_URL
docker-compose config | grep VITE_API_BASE_URL
```

### Out of disk space
```bash
# Clean up unused Docker resources
docker system prune -a

# Remove postgres data to start fresh (WARNING: deletes data!)
docker volume rm samberd_postgres_data
```

---

## 🔄 Updates

### Update to latest version
```bash
# Pull latest images
docker-compose pull

# Restart services
docker-compose up -d
```

### Update code (from GitHub)
```bash
git pull origin main
docker-compose pull
docker-compose up -d
```

---

## 📞 Getting Help

1. Check [docker-compose.md](docker-compose.md) for Docker issues
2. Read [GITHUB_ACTIONS.md](GITHUB_ACTIONS.md) for CI/CD details
3. See [PLAN.md](PLAN.md) for architecture questions
4. Check [README.md](README.md) for general info

---

## 🎉 You're Done!

Your Samberd instance is running and ready to use:
- Share the frontend URL with your users
- Create events in the admin panel
- Start planning trips!

Enjoy! ✈️🚌🚗⛵
