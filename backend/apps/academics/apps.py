from django.apps import AppConfig


class AcademicsConfig(AppConfig):
    name = 'backend.apps.academics'

    def ready(self):
        import threading
        def _init_mongo():
            from backend.apps.academics.services.notas_mongo_service import ensure_indexes
            ensure_indexes()
        threading.Thread(target=_init_mongo, daemon=True).start()
