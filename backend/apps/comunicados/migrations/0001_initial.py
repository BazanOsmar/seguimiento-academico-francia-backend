from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('students', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Comunicado',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('titulo', models.CharField(max_length=150)),
                ('descripcion', models.TextField()),
                ('estado', models.CharField(choices=[('ACTIVO', 'Activo'), ('ANULADO', 'Anulado')], default='ACTIVO', max_length=10)),
                ('fecha_creacion', models.DateTimeField(auto_now_add=True)),
                ('fecha_expiracion', models.DateField(blank=True, null=True)),
                ('emisor', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='comunicados_emitidos',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-fecha_creacion'],
            },
        ),
        migrations.CreateModel(
            name='ComunicadoEstudiante',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('estado', models.CharField(choices=[('ENVIADO', 'Enviado'), ('LEIDO', 'Leído')], default='ENVIADO', max_length=10)),
                ('comunicado', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='entregas',
                    to='comunicados.comunicado',
                )),
                ('estudiante', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='comunicados',
                    to='students.estudiante',
                )),
            ],
            options={
                'unique_together': {('comunicado', 'estudiante')},
            },
        ),
        migrations.AddIndex(
            model_name='comunicadoestudiante',
            index=models.Index(fields=['comunicado', 'estado'], name='comunicados_comunic_comuni_estado_idx'),
        ),
    ]
