# Unified MCQ Solver

Standardized monorepo with clear separation of concerns.

## Repository Structure
- `backend/`: FastAPI application core (captcha, exam, autofill).
- `frontend/`: React/Vite admin dashboard source.
- `extension/`: Cross-browser extension source (Manifest V3).
- `config/`: Runtime configuration (`.env`, `config.yaml`).
- `infra/`: Deployment assets (Docker, Nginx, Systemd).
- `scripts/`: Local tooling and lifecycle scripts.

## Docker Deployment (Standardized)
1. Create your deployment env file:
```bash
cp .env.example .env
```
2. Edit `.env` and change at least:
- `AUTH_HASH_SALT`
- `ADMIN_TOKEN`
- `ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`
3. From repository root run:
```bash
docker compose up -d --build
```
4. Open API health endpoint:
- `http://localhost:8080/health`

Notes:
- Persistent runtime data is stored under `./runtime/sa_helper/*` by default.
- App containers run as non-root user `1001:1001` by default (`PUID`/`PGID` configurable).
- Telegram sidecar services are opt-in and disabled by default. Enable with:
```bash
docker compose --profile telegram up -d
```
- To validate the deployment config before starting services:
```bash
docker compose config
```

## Local (Non-Docker) Backend
1. Go to `backend/` and set up your venv.
2. Copy `config/backend.env` to `config/.env` and fill values.
3. Run `./scripts/start_backend.sh` (Linux) or `./scripts/start.bat` (Windows).

## Frontend (Admin Dashboard)
- Go to `frontend/` and run:
```bash
npm install
npm run lint
npm run build
```
- Backend serves built assets from `frontend/dist`.

## Quality Standards
- Repository formatting is defined in `.editorconfig`.
- Backend lint/test config is defined in `backend/pyproject.toml`.
- Optional pre-commit hooks are defined in `.pre-commit-config.yaml`.
- CI quality checks run in `.github/workflows/quality.yml`.

Local quality commands:
```bash
python -m pip install -r backend/requirements-dev.txt
python -m pytest backend/tests -q
ruff check backend/app backend/tests
npm --prefix frontend ci
npm --prefix frontend run lint
docker compose config
```

## Extension
- Load `extension/` as unpacked extension in Chrome/Edge.
- Configure Server URL and API Key in extension options.

## Canonical Paths
- Config: `config/`
- Models: `data/models/`
- Data/DB: `backend/logs/app.db`
