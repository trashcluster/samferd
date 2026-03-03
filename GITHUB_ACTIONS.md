# CI/CD & Container Registry

## GitHub Actions Workflow

Automated Docker image building and publishing to GitHub Container Registry (GHCR).

### Workflow: Build and Push Docker Images

**File:** `.github/workflows/docker-build.yml`

**Triggers:**
- Push to `main` branch → Build & push latest images
- Push to `develop` branch → Build & push develop-tagged images
- Pull requests → Build only (don't push)

**What it does:**
1. Builds backend Docker image from `backend/Dockerfile`
2. Builds frontend Docker image from `frontend/Dockerfile`
3. Pushes to GitHub Container Registry if not a PR
4. Tags images with:
   - `latest` (main branch only)
   - Git branch name
   - Git SHA (short hash)
   - Semantic version (if tags are used)

### Image Locations

After successful build, images are published to:

```
ghcr.io/trashclyster/samferd-backend:<tag>
ghcr.io/trashclyster/samferd-frontend:<tag>
```

**Example:**
```bash
docker pull ghcr.io/trashclyster/samferd-backend:latest
docker pull ghcr.io/trashclyster/samferd-frontend:latest
```

### Using Published Images

The `docker-compose.yml` is pre-configured to use the published images:

```yaml
backend:
  image: ghcr.io/trashclyster/samferd-backend:latest

frontend:
  image: ghcr.io/trashclyster/samferd-frontend:latest
```

Simply run:
```bash
docker-compose up -d
```

### First-Time Setup

1. **Push to GitHub** (main branch)
   ```bash
   git push origin main
   ```

2. **Wait for GitHub Actions** to complete (1-2 minutes)

3. **Check Actions tab** in your repository:
   https://github.com/trashclyster/[REPO_NAME]/actions

4. **Once complete**, images are ready to use:
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

### Docker Build Cache

The workflow uses GitHub Actions cache to speed up builds:
```yaml
cache-from: type=gha
cache-to: type=gha,mode=max
```

This means:
- First build: ~2-3 minutes
- Subsequent builds: ~30-60 seconds (if code changes are small)

### Dockerfile Details

**Backend:**
- Multi-stage Go build (reduces final image size)
- Base: Alpine 3.18 (small, secure)
- Result: ~50-100 MB image

**Frontend:**
- Multi-stage Node build
- Base: Node 18 on Alpine
- Served with `serve` package
- Result: ~150-200 MB image

### Manual Image Building

If you need to build locally for testing:

```bash
# Backend
docker build -f backend/Dockerfile -t samferd-backend:test .

# Frontend
docker build -f frontend/Dockerfile -t samferd-frontend:test .

# Test with local images
docker-compose -f docker-compose.yml up -d
```

### Image Configuration

Both images are designed to work together:

**Backend expects:**
- `DB_HOST=postgres` (Docker hostname)
- `DB_PORT=5432`
- `FRONTEND_URL` for CORS

**Frontend expects:**
- `VITE_API_BASE_URL=http://backend:8080` or external URL

All configured in `docker-compose.yml` environment variables.

### Secrets Management

The GitHub Actions workflow uses `secrets.GITHUB_TOKEN` for authentication.

This is automatically provided by GitHub Actions - **no setup needed**.

If you want to use custom registry credentials:
1. Go to Repository Settings → Secrets
2. Add `REGISTRY_USERNAME` and `REGISTRY_PASSWORD`
3. Update the workflow to use them

### Troubleshooting Actions

**Build failed?** Click on the failed action in GitHub Actions tab to see logs.

**Common issues:**
- `Dockerfile not found` → Check file paths in workflow
- `Authentication failed` → GITHUB_TOKEN permissions issue (shouldn't happen)
- `Out of disk space` → GitHub provides 14GB (should be enough)

### Image Tags Explained

Images are tagged with multiple labels:

| Tag | When Used | Example |
|-----|-----------|---------|
| `latest` | Main branch | `ghcr.io/trashclyster/samferd-backend:latest` |
| Branch name | Any branch | `ghcr.io/trashclyster/samferd-backend:develop` |
| Commit SHA | Any push | `ghcr.io/trashclyster/samferd-backend:abc1234` |
| Version tag | Git tags | `ghcr.io/trashclyster/samferd-backend:v1.0.0` |

To use a specific version:
```bash
docker pull ghcr.io/trashclyster/samferd-backend:abc1234
```

### Production Deployment

For production, you can:

1. **Use latest images from main branch**
   ```bash
   docker-compose up -d
   ```

2. **Pin to specific version**
   Edit `docker-compose.yml`:
   ```yaml
   backend:
     image: ghcr.io/trashclyster/samferd-backend:v1.0.0
   
   frontend:
     image: ghcr.io/trashclyster/samferd-frontend:v1.0.0
   ```

3. **Use Git tags for versions**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   # Wait for GitHub Actions to build
   # Use the v1.0.0 tagged images
   ```

### Next Steps

1. Push this repository to GitHub
2. GitHub Actions automatically builds
3. Run `docker-compose up -d` to deploy anywhere
4. No Docker build tools needed on deployment machine!

---

**See Also:**
- [docker-compose.md](../docker-compose.md) - Docker Compose usage
- [PLAN.md](../PLAN.md) - Application architecture
- [README.md](../README.md) - General project info
