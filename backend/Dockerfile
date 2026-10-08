FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/data/route53.db

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# The SQLite file lives in /data. Mount a persistent volume there (Railway volume, docker volume)
# so data survives restarts and redeploys. (No VOLUME instruction: Railway rejects it.)
RUN mkdir -p /data

EXPOSE 8000
# $PORT is injected by Render/Railway; default 8000 locally. One worker: SQLite has a single writer.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
