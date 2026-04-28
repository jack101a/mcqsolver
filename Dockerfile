# Stage 1: Build Frontend
FROM node:20 AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Final Image
FROM python:3.11-bookworm

# Install system dependencies
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update || (sleep 5 && apt-get update) && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-hin \
    libgl1-mesa-glx \
    libglib2.0-0 \
    zip \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Copy built frontend from Stage 1
COPY --from=frontend-builder /frontend/dist /app/frontend/dist

# Link the built dashboard to the template folder
# This fixes the TemplateNotFound: admin.html error when React build is not preferred
RUN mkdir -p /app/backend/app/templates && \
    cp /app/frontend/dist/index.html /app/backend/app/templates/admin.html

# Set Python path to include backend/ so app.main works
ENV PYTHONPATH=/app/backend
EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/v1/auth/verify || exit 1

# Start command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
