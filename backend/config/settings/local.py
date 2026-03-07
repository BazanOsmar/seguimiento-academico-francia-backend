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
