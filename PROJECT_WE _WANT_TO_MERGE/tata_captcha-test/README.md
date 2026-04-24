# tata-captcha

Backend and extension are now separated by responsibility:

- `backend/`: API, admin dashboard UI, config, datasets, models, logs, Docker files
- `extension/`: browser extension source and packaged extension builds
- `trash/`: old, duplicate, or no-longer-used files kept out of the active codebase

## Run Backend

```powershell
.\launch_backend.bat
```

Or directly:

```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --app-dir backend
```

Admin login:

- `http://localhost:8080/admin/login`

## Project Paths

- Backend app: `backend/app/`
- Admin React UI: `backend/admin-ui/`
- Backend config: `backend/config/config.yaml`
- Backend datasets: `backend/datasets/`
- Backend models: `backend/models/`
- Extension source: `extension/`
- Extension packaged builds: `extension/dist/`
- Archived files: `trash/`

## Extension Setup

1. Load the unpacked extension from `extension/`
2. Open extension options
3. Set `API Base URL` to `http://localhost:8080`
4. Create an API key in admin and paste it into the extension
5. Click `Sync`

## Admin Dashboard

The admin dashboard is a React UI served by FastAPI and wired to the live backend.

Main areas:

- API key management
- Domain access control
- Model registry
- Domain field mappings
- Failed payload correction queue
- Extension proposal approval

## Docker

Relevant backend files:

- `backend/docker-compose.yml`
- `backend/docker/Dockerfile`

The backend now expects:

- config at `/app/backend/config/config.yaml`
- datasets at `/app/backend/datasets`
- models at `/app/backend/models`

