from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0004_profesorplan_profesor_curso'),
    ]

    operations = [
        migrations.AddField(
            model_name='profesorplan',
            name='eliminado',
            field=models.BooleanField(default=False),
        ),
    ]
