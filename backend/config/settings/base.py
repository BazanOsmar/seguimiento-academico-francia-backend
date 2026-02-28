import os
from pathlib import Path
from datetime import timedelta

# base.py está en backend/config/settings/ → tres niveles arriba = backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent

AUTH_USER_MODEL = 'users.User'

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')

INSTALLED_APPS = [
    # Django
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Terceros
    'rest_framework',
    'rest_framework_simplejwt',

    # Apps del dominio
    'backend.apps.users.apps.UsersConfig',
    'backend.apps.students.apps.StudentsConfig',
    'backend.apps.academics.apps.AcademicsConfig',
    'backend.apps.attendance.apps.AttendanceConfig',
    'backend.apps.discipline.apps.DisciplineConfig',
    'backend.apps.notifications.apps.NotificationsConfig',
    'backend.apps.analytics.apps.AnalyticsConfig',
    'backend.apps.auditoria.apps.AuditoriaConfig',
    'backend.apps.authentication',

    # Frontend
    'backend.apps.pages',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'backend.config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend.config.wsgi.application'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(hours=1),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'es-bo'
TIME_ZONE = 'America/La_Paz'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'static']

# ── Firebase Admin SDK ────────────────────────────────────────────
import firebase_admin
from firebase_admin import credentials as fb_credentials

_FIREBASE_CREDS = BASE_DIR / 'config' / 'secrets' / 'firebase-adminsdk.json'
if _FIREBASE_CREDS.exists() and not firebase_admin._apps:
    firebase_admin.initialize_app(fb_credentials.Certificate(str(_FIREBASE_CREDS)))

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'backend.apps.attendance': {
            'handlers': ['console'],
            'level': 'WARNING',
        },
    },
}
