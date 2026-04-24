from .curso_views import CursoListView, ProfesorCursosView, MateriasXCursoView
from .materia_views import MateriaListCreateView, MateriaDetailView
from .asignacion_views import AsignacionListCreateView, AsignacionDetailView, ProfesorMisAsignacionesView
from .plan_views import (
    ProfesorPlanListCreateView, ProfesorPlanHistorialView, ProfesorPlanDetailView,
    DirectorPlanesView, DirectorPlanesExportarView,
)
from .planilla_views import (
    ValidarPlanillaView, ConfirmarPlanillaView, NotasMongoView,
    EstadoNotasView, NotasEstadoMesView, NotasEstudianteProfesorView,
)
from .comparador_views import ComparadorNombresView
from .director_notas_views import DirectorResumenNotasMesView, DirectorNotasMesDetalleView
