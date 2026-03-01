from django.contrib import admin
from .models import User, TipoUsuario
# Register your models here.


from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from .models import User, TipoUsuario

@admin.register(User)
class UserAdmin(DjangoUserAdmin):

    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("Información personal", {
            "fields": ("first_name", "last_name", "email")
        }),
        ("Permisos", {
            "fields": (
                "is_active",
                "is_staff",
                "is_superuser",
                "groups",
                "user_permissions",
            )
        }),
        ("Fechas importantes", {
            "fields": ("last_login", "date_joined")
        }),
        ("Información adicional", {
            "fields": ("tipo_usuario", "primer_ingreso")
        }),
    )

    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": (
                "username",
                "password1",
                "password2",
                "first_name",
                "last_name",
                "email",
                "tipo_usuario",
                "primer_ingreso",
            ),
        }),
    )


admin.site.register(TipoUsuario)
