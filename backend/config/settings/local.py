from .base import *
import os

DEBUG = True

SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-ur2sqa76o*c)d77af0nzpnc!n01!)@%36$=4hh=3b2&0y6*#l_'
)

ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '10.0.2.2']

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# ── Secrets de desarrollo ─────────────────────────────────────────
# backend/config/secrets/local_secrets.py está en .gitignore
# Se inyectan como variables de entorno para que las vistas las lean con os.environ.get()
try:
    from backend.config.secrets import local_secrets as _s
    os.environ.setdefault('MONGO_URI',           _s.MONGO_URI)
    os.environ.setdefault('MONGO_DB_NAME',        _s.MONGO_DB_NAME)
    os.environ.setdefault('DEV_BYPASS_PASS',      _s.DEV_BYPASS_PASS)
    os.environ.setdefault('DEV_BYPASS_DIRECTOR',  _s.DEV_BYPASS_DIRECTOR)
    os.environ.setdefault('DEV_BYPASS_REGENTE',   _s.DEV_BYPASS_REGENTE)
    os.environ.setdefault('EMAIL_HOST_USER',      getattr(_s, 'EMAIL_HOST_USER', ''))
    os.environ.setdefault('EMAIL_HOST_PASSWORD',  getattr(_s, 'EMAIL_HOST_PASSWORD', ''))
    os.environ.setdefault('EMAIL_DESTINATARIO',   getattr(_s, 'EMAIL_DESTINATARIO', ''))
    # Sobreescribir los settings de Django porque base.py los evaluó antes de que
    # se inyectaran las env vars (el from .base import * corre primero)
    EMAIL_HOST_USER     = getattr(_s, 'EMAIL_HOST_USER', '')
    EMAIL_HOST_PASSWORD = getattr(_s, 'EMAIL_HOST_PASSWORD', '')
    EMAIL_DESTINATARIO  = getattr(_s, 'EMAIL_DESTINATARIO', '')
except ImportError:
    pass  # En CI/staging las variables llegan por entorno real

MONGO_URI     = os.environ.get('MONGO_URI', '')
MONGO_DB_NAME = os.environ.get('MONGO_DB_NAME', 'seguimiento_academico')
