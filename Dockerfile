FROM python:3.11-bookworm

# Install system dependencies
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update || (sleep 5 && apt-get update) && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-hin \
    libgl1-mesa-glx \
    libglib2.0-0 \
    zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# 🚀 FIX: Rename the built frontend to admin.html inside the template folder
RUN cp /app/frontend/dist/index.html /app/backend/app/templates/admin.html

# Set Python path to include backend/ so app.main works
ENV PYTHONPATH=/app/backend

# Expose port
EX
