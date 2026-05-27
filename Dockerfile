# Usamos una imagen ligera de Python
FROM python:3.11-slim

# Evita que Python genere archivos .pyc y fuerza la salida en consola
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Instalamos dependencias del sistema necesarias para compilar algunas librerías
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copiamos primero el archivo de dependencias (aprovecha la caché de Docker)
COPY requirements.txt .

# Instalamos las librerías
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos el resto del código
COPY . .

# Exponemos el puerto de FastAPI
EXPOSE 8000