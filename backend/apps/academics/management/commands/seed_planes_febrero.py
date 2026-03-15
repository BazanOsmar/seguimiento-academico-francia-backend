from datetime import date

from django.core.management.base import BaseCommand

from backend.apps.academics.models import PlanDeTrabajo, ProfesorCurso, ProfesorPlan

MES = 2  # Febrero

SEMANAS = [
    (1, date(2026, 2,  2), date(2026, 2,  6)),
    (2, date(2026, 2,  9), date(2026, 2, 13)),
    (3, date(2026, 2, 16), date(2026, 2, 20)),
    (4, date(2026, 2, 23), date(2026, 2, 27)),
]

# 4 variantes por semana, rotadas por índice de ProfesorCurso
DESCRIPCIONES = {
    1: [
        "Diagnóstico inicial del nivel de aprendizaje mediante pruebas orales y escritas. "
        "Identificación de conocimientos previos y áreas de refuerzo prioritarias. "
        "Planificación de la secuencia didáctica para el primer bimestre.",

        "Evaluación diagnóstica participativa: exploración de saberes previos en grupos de trabajo. "
        "Revisión del currículo y ajuste de contenidos al contexto sociocultural. "
        "Elaboración del plan de aula para las siguientes semanas.",

        "Diagnóstico del estado de comprensión lectora y habilidades básicas de los estudiantes. "
        "Aplicación de instrumentos de evaluación inicial. "
        "Organización de grupos de aprendizaje colaborativo según perfil detectado.",

        "Revisión curricular y contextualización de contenidos del primer bimestre. "
        "Actividades de motivación e integración grupal al inicio del año. "
        "Establecimiento de acuerdos de convivencia y metodología de trabajo.",
    ],
    2: [
        "Desarrollo de los contenidos conceptuales de la unidad 1 mediante estrategias de aprendizaje activo. "
        "Uso de mapas conceptuales, análisis de casos y resolución de ejercicios graduales. "
        "Retroalimentación individual sobre el desempeño de la semana anterior.",

        "Profundización en los temas centrales a través de lecturas dirigidas y discusión grupal. "
        "Elaboración de resúmenes, esquemas y fichas de trabajo por los estudiantes. "
        "Registro de avances y dificultades en el cuaderno de seguimiento docente.",

        "Aplicación de estrategias de aprendizaje cooperativo: rompecabezas y aprendizaje por proyectos. "
        "Seguimiento del progreso individual mediante listas de cotejo. "
        "Refuerzo diferenciado para estudiantes con mayor dificultad.",

        "Clases expositivas con soporte visual y participación activa de los estudiantes. "
        "Ejercicios de aplicación práctica y corrección colectiva. "
        "Revisión de tareas y retroalimentación formativa sobre los trabajos presentados.",
    ],
    3: [
        "Consolidación de aprendizajes mediante actividades integradoras y talleres prácticos. "
        "Evaluación formativa con rúbricas de desempeño. "
        "Preparación para la evaluación sumativa: repaso temático y resolución de dudas.",

        "Taller de aplicación: los estudiantes presentan sus trabajos ante el grupo y reciben retroalimentación de pares. "
        "Autoevaluación y coevaluación guiada. "
        "Ajuste de estrategias pedagógicas según resultados observados.",

        "Revisión general de los contenidos trabajados en el mes. "
        "Estrategias de estudio y organización para la evaluación: esquemas, resúmenes y mapas mentales. "
        "Atención individualizada a estudiantes con bajo rendimiento.",

        "Actividades de refuerzo diferenciado: profundización para estudiantes con buen desempeño "
        "y nivelación para quienes presentan dificultades. "
        "Evaluación intermedia de los aprendizajes y registro de resultados.",
    ],
    4: [
        "Evaluación sumativa de la unidad correspondiente al mes de febrero. "
        "Análisis colectivo de resultados y retroalimentación grupal e individual. "
        "Inicio de la planificación participativa con los estudiantes para el mes de marzo.",

        "Cierre de la unidad con actividad integradora: proyecto, exposición o producto final. "
        "Autoevaluación del proceso de aprendizaje. "
        "Registro de logros, dificultades y compromisos de mejora.",

        "Presentación de proyectos del mes y evaluación integral de competencias desarrolladas. "
        "Reflexión docente sobre la práctica pedagógica del período. "
        "Elaboración del informe de avance para la dirección.",

        "Evaluación y cierre del mes de febrero: consolidación de calificaciones y registro en el sistema. "
        "Retroalimentación a familias y tutores sobre el desempeño observado. "
        "Planificación del contenido para el siguiente mes.",
    ],
}


class Command(BaseCommand):
    help = "Crea planes de trabajo de febrero 2026 para cada ProfesorCurso activo."

    def handle(self, *args, **options):
        asignaciones = list(
            ProfesorCurso.objects
            .select_related('profesor', 'materia', 'curso')
            .filter(profesor__first_name__gt='')
            .order_by('profesor__last_name', 'profesor__first_name', 'materia__nombre')
        )

        if not asignaciones:
            self.stdout.write(self.style.WARNING("No se encontraron asignaciones."))
            return

        creados  = 0
        omitidos = 0

        for idx, pc in enumerate(asignaciones):
            variante = idx % 4
            for semana, fecha_inicio, fecha_fin in SEMANAS:
                existe = ProfesorPlan.objects.filter(
                    profesor_curso=pc,
                    mes=MES,
                    plan__fecha_inicio=fecha_inicio,
                ).exists()

                if existe:
                    omitidos += 1
                    continue

                plan = PlanDeTrabajo.objects.create(
                    descripcion=DESCRIPCIONES[semana][variante],
                    fecha_inicio=fecha_inicio,
                    fecha_fin=fecha_fin,
                )
                ProfesorPlan.objects.create(profesor_curso=pc, plan=plan, mes=MES)
                creados += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Listo. {creados} planes creados, {omitidos} omitidos (ya existían)."
            )
        )
