import os
from django import template
from django.templatetags.static import static
from django.conf import settings

register = template.Library()


@register.simple_tag
def static_v(path):
    """
    Como {% static %} pero añade ?v=<mtime> automáticamente.
    El navegador descarga el archivo de nuevo solo cuando fue modificado.
    Uso: {% static_v 'js/curso_estudiantes.js' %}
    """
    url = static(path)
    abs_path = os.path.join(settings.BASE_DIR, 'static', path)
    try:
        mtime = int(os.path.getmtime(abs_path))
    except OSError:
        return url
    return f"{url}?v={mtime}"
