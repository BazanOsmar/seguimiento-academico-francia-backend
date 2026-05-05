# Demo K-Means: Plan y pasos para repetir la prueba

## Objetivo
Demostrar el flujo completo de K-Means:
1. Todos los profesores cargan notas de mayo excepto Julia Quispe (1ro A, Artes Plasticas)
2. El usuario carga manualmente las notas de Julia desde el frontend
3. El sistema detecta que es el ultimo profesor y dispara K-Means automaticamente
4. El director recibe notificacion con el resumen de los clusters

---

## Datos generados por el script

| Dato | Detalle |
|---|---|
| Asistencia | Abril 2026, lunes a viernes (22 dias habiles), 20 cursos |
| Notas | Mayo 2026 (mes 5, trimestre 2), 233 de 234 ProfesorCurso |
| Citaciones | Mayo 2026, estudiantes en perfil apoyo y critico |
| Notificaciones | Una por cada profesor que "subio" notas (marcadas como leidas) |

### Distribucion de perfiles (por est_id % 20)
| Perfil | est_id % 20 | Ser | Saber | Hacer | Tareas |
|---|---|---|---|---|---|
| Excelente | 0-4 (25%) | 8-10 | 36-45 | 33-40 | 90-100% |
| Satisfactorio | 5-10 (30%) | 6-8 | 25-35 | 24-32 | 75-90% |
| Requiere Apoyo | 11-16 (30%) | 4-6 | 14-24 | 14-23 | 50-75% |
| Riesgo Critico | 17-19 (15%) | 2-5 | 5-13 | 5-12 | 20-50% |

---

## Pasos para ejecutar (primera vez o repeticion)

### 1. Asegurarse de estar en master con los cambios de notificaciones
```bash
git checkout master
git pull origin master
```

### 2. Deploy en staging (solo si hay cambios de codigo nuevos)
```bash
cd /opt/francia/staging
git pull origin master
docker build -t staging-web:latest .
docker stop staging-web-1 && docker rm staging-web-1
docker compose -f docker-compose.staging.yml up -d web
docker compose -f docker-compose.staging.yml exec web python manage.py migrate
docker compose -f docker-compose.staging.yml exec web python manage.py collectstatic --noinput
docker compose -f docker-compose.staging.yml restart web
```

### 3. Correr el script de seeding
```bash
cd /opt/francia/staging
docker compose -f docker-compose.staging.yml exec web python manage.py seed_demo_kmeans
```

### 4. Verificar datos generados
```bash
# Verificar notas en MongoDB (debe haber 233 combinaciones unicas profesor/materia/curso)
docker compose -f docker-compose.staging.yml exec mongo-staging mongosh "mongodb://localhost:27017/seguimiento_dev" --quiet --eval "
  var r = db.notas_mensuales.aggregate([
    {'\$match': {gestion: 2026, mes: 5}},
    {'\$group': {_id: {p: '\$profesor_id', m: '\$materia_id', c: '\$curso_id'}}},
    {'\$count': 'total'}
  ]).toArray();
  print('Combinaciones profesor/materia/curso:', r[0]?.total);
  print('Documentos totales:', db.notas_mensuales.countDocuments({gestion: 2026, mes: 5}));
"

# Verificar asistencia en PostgreSQL
docker compose -f docker-compose.staging.yml exec web python manage.py shell -c "
from backend.apps.attendance.models import AsistenciaSesion, Asistencia
print('Sesiones abril:', AsistenciaSesion.objects.filter(fecha__month=4, fecha__year=2026).count())
print('Asistencias abril:', Asistencia.objects.filter(sesion__fecha__month=4, sesion__fecha__year=2026).count())
"
```

### 5. Cargar las notas de Julia Quispe desde el frontend
- URL: https://staging.colegiofrancia.lat/profesor/
- Usuario: `juliaquispe`
- Subir planilla de ARTES PLASTICAS en 1ro A para mayo 2026
- Al confirmar la planilla, K-Means se dispara automaticamente en segundo plano

### 6. Verificar que K-Means corrio
```bash
docker compose -f docker-compose.staging.yml exec mongo-staging mongosh "mongodb://localhost:27017/seguimiento_dev" --quiet --eval "
  print('Predicciones mayo:', db.predicciones.countDocuments({gestion: 2026, mes: 5}));
  print('Clusters:');
  db.predicciones.aggregate([
    {'\$match': {gestion: 2026, mes: 5}},
    {'\$group': {_id: '\$cluster', total: {'\$sum': 1}}},
    {'\$sort': {total: -1}}
  ]).forEach(r => print(' ', r._id + ':', r.total));
"
```

---

## Planilla de Julia Quispe (lo que debe subir)

**Materia:** ARTES PLASTICAS Y VISUALES  
**Curso:** 1ro A (34 estudiantes)  
**Mes de las actividades:** mayo 2026 (columnas con fechas en mayo)

Para que las notas de Julia sean coherentes con el perfil del resto del curso:

| Dimension | Columnas sugeridas | Escala | Sugerencia por perfil |
|---|---|---|---|
| SER | 2 columnas en mayo | /10 total | Excelente: 8-10, Satisfactorio: 6-8, Apoyo: 4-6, Critico: 2-5 |
| SABER | 3 columnas en mayo (examenes) | /45 total | Excelente: 36-45, Satisfactorio: 25-35, Apoyo: 14-24, Critico: 5-13 |
| HACER | 3 columnas en mayo (tareas) | /40 total | Excelente: 33-40, Satisfactorio: 24-32, Apoyo: 14-23, Critico: 5-12 |

Para saber que perfil tiene cada estudiante de 1ro A: `est_id % 20`
- 0-4: Excelente | 5-10: Satisfactorio | 11-16: Apoyo | 17-19: Critico

IDs de los 34 estudiantes de 1ro A: 1 al 33, mas el 562.

---

## Notificaciones generadas automaticamente

| Evento | Receptor | Mensaje |
|---|---|---|
| Cada profesor confirma planilla | Director | "{Nombre} cargo notas de {Materia} en {Curso}, mes 5 de 2026" |
| K-Means completa | Director | "Analisis K-Means completado para el mes 5 de 2026. X estudiantes en Y grupos..." |

Las notificaciones del seeding se marcan como **leidas** para no saturar el centro de avisos.
La de Julia y la de K-Means seran **no leidas** (generadas en tiempo real).

---

## Para limpiar y repetir desde cero
```bash
# Solo limpiar MongoDB y volver a correr el seeding
docker compose -f docker-compose.staging.yml exec web python manage.py seed_demo_kmeans
```
El script limpia MongoDB automaticamente al inicio. La asistencia de abril en SQL no se borra
(usa get_or_create, es idempotente).
