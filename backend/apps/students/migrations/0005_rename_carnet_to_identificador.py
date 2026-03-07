from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0004_estudiante_activo'),
    ]

    operations = [
        migrations.RenameField(
            model_name='estudiante',
            old_name='carnet',
            new_name='identificador',
        ),
    ]
