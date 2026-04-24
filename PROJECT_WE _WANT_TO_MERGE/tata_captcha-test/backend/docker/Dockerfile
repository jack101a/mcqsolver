FROM node:24-alpine AS admin_ui_builder

WORKDIR /ui

COPY admin-ui/package.json /ui/package.json
COPY admin-ui/package-lock.json /ui/package-lock.json
RUN npm ci
COPY admin-ui /ui
RUN npm run build

FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/backend/app
COPY --from=admin_ui_builder /ui/dist /app/backend/admin-ui/dist
COPY models /app/backend/models
COPY models /app/defaults/models
COPY scripts /app/backend/scripts
COPY config /app/defaults
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV CONFIG_PATH=/app/backend/config/config.yaml
ENV SQLITE_PATH=/app/backend/logs/app.db
ENV PYTHONPATH=/app/backend

EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
