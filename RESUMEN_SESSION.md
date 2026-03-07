# Resumen de sesión — 2026-03-03

## Endpoint implementado: Registro de tutor/padre

### Contexto
Los tutores/padres necesitan registrarse desde la app móvil vinculándose a un estudiante existente mediante su identificador. Cada cuenta de tutor se vincula a un solo estudiante.

### Endpoint
`POST /api/auth/registro-tutor/` — público, sin autenticación

### Archivos creados/modificados
| Archivo | Acción |
|---------|--------|
| `backend/apps/authentication/validators.py` | Creado — validador de contraseña con reglas ISO |
| `backend/apps/authentication/serializers.py` | Editado — nuevo `RegistroTutorSerializer` |
| `backend/apps/authentication/views.py` | Editado — nueva `RegistroTutorView` |
| `backend/apps/authentication/urls.py` | Editado — ruta `registro-tutor/` |

### Validaciones implementadas
- Estudiante existe por `identificador` y está activo
- Estudiante no tiene tutor asignado
- Username no está en uso
- Password cumple reglas ISO:
  - Mínimo 8 caracteres
  - Al menos 1 mayúscula, 1 minúscula, 1 número, 1 carácter especial
  - Sin espacios
- `password` == `password_confirmacion`

### Flujo
1. Tutor envía: `identificador_estudiante`, `username`, `nombre`, `apellidos`, `password`, `password_confirmacion`
2. Se valida todo en el serializer
3. Se crea User con `tipo_usuario=Tutor`, `primer_ingreso=False` en transacción atómica
4. Se vincula `estudiante.tutor = user`
5. Se devuelven tokens JWT para login inmediato + datos del estudiante

### Respuesta exitosa (201)
```json
{
  "access": "eyJ...",
  "refresh": "eyJ...",
  "user": { "id", "username", "first_name", "last_name", "tipo_usuario", "primer_ingreso" },
  "estudiante": { "id", "nombre", "apellidos", "curso" }
}
```

### Documentación
- Endpoint documentado en Notion (página PRUEBA ENDPOINTS)
- Se verificó que no hay endpoints obsoletos en la documentación de Notion
