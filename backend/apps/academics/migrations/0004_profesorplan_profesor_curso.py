from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0003_plandetrabajo_profesorplan'),
    ]

    operations = [
        # Quitar unique_together viejo
        migrations.AlterUniqueTogether(
            name='profesorplan',
            unique_together=set(),
        ),
        # Eliminar FK profesor
        migrations.RemoveField(
            model_name='profesorplan',
            name='profesor',
        ),
        # Agregar FK profesor_curso
        migrations.AddField(
            model_name='profesorplan',
            name='profesor_curso',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='planes',
                to='academics.profesorcurso',
                default=1,  # temporal, tabla vacía
            ),
            preserve_default=False,
        ),
        # Nuevo unique_together
        migrations.AlterUniqueTogether(
            name='profesorplan',
            unique_together={('profesor_curso', 'plan')},
        ),
    ]
