FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN DJANGO_SETTINGS_MODULE=backend.config.settings.production \
    DJANGO_SECRET_KEY=build-temp \
    DJANGO_ALLOWED_HOSTS=localhost \
    DB_ENGINE=django.db.backends.sqlite3 \
    DB_NAME=/tmp/build.db \
    DB_USER=x DB_PASSWORD=x \
    DB_HOST=localhost DB_PORT=5432 \
    python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "backend.config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--worker-class", "gthread", "--threads", "4", "--timeout", "60", "--keep-alive", "5", "--access-logfile", "-"]