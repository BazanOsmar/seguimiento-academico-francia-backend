"""
Tests de authentication:
- Validadores puros de contraseña y nombre de usuario (validators.py)
- Endpoints de login, perfil y verificación de contraseña
"""
from django.test import TestCase
from rest_framework import serializers
from rest_framework.test import APITestCase
from rest_framework import status

from backend.apps.users.models import TipoUsuario, User
from .validators import validar_password, validar_username


class ValidarPasswordTests(TestCase):
    """Reglas de validar_password: 8–64 chars, sin espacios, may/min/dígito/especial."""

    def test_password_valida_pasa(self):
        # No debe lanzar y retorna el mismo valor
        self.assertEqual(validar_password('Abc123$x'), 'Abc123$x')

    def test_demasiado_corta(self):
        with self.assertRaises(serializers.ValidationError):
            validar_password('Ab1$')

    def test_demasiado_larga(self):
        with self.assertRaises(serializers.ValidationError):
            validar_password('Ab1$' + 'a' * 70)

    def test_con_espacio(self):
        with self.assertRaises(serializers.ValidationError):
            validar_password('Abc 123$')

    def test_sin_minuscula(self):
        with self.assertRaises(serializers.ValidationError):
            validar_password('ABC123$X')

    def test_sin_mayuscula(self):
        with self.assertRaises(serializers.ValidationError):
            validar_password('abc123$x')

    def test_sin_digito(self):
        with self.assertRaises(serializers.ValidationError):
            validar_password('Abcdef$x')

    def test_sin_caracter_especial(self):
        with self.assertRaises(serializers.ValidationError):
            validar_password('Abc12345')


class ValidarUsernameTests(TestCase):
    """Reglas de validar_username: 5–20 chars, sin espacios, alfanum + _, al menos una letra."""

    def test_username_valido(self):
        self.assertEqual(validar_username('profe_01'), 'profe_01')

    def test_recorta_espacios_extremos(self):
        self.assertEqual(validar_username('  profe_01  '), 'profe_01')

    def test_demasiado_corto(self):
        with self.assertRaises(serializers.ValidationError):
            validar_username('abc')

    def test_con_espacio_interno(self):
        with self.assertRaises(serializers.ValidationError):
            validar_username('profe 01')

    def test_caracter_invalido(self):
        with self.assertRaises(serializers.ValidationError):
            validar_username('profe-01')

    def test_solo_numeros_sin_letra(self):
        with self.assertRaises(serializers.ValidationError):
            validar_username('123456')


class LoginEndpointTests(APITestCase):
    """POST /api/auth/login/"""

    @classmethod
    def setUpTestData(cls):
        cls.tipo_director = TipoUsuario.objects.create(nombre='Director')
        cls.tipo_tutor    = TipoUsuario.objects.create(nombre='Tutor')

        cls.director = User.objects.create_user(
            username='director_test', password='ClaveSegura1$',
            tipo_usuario=cls.tipo_director,
        )

    def test_login_exitoso_devuelve_tokens(self):
        resp = self.client.post('/api/auth/login/', {
            'username': 'director_test',
            'password': 'ClaveSegura1$',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('access', resp.data)
        self.assertIn('refresh', resp.data)
        self.assertEqual(resp.data['user']['tipo_usuario'], 'Director')

    def test_login_credenciales_invalidas(self):
        resp = self.client.post('/api/auth/login/', {
            'username': 'director_test',
            'password': 'incorrecta',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_tutor_sin_estudiantes_activos_no_puede_ingresar(self):
        User.objects.create_user(
            username='tutor_test', password='ClaveSegura1$',
            tipo_usuario=self.tipo_tutor,
        )
        resp = self.client.post('/api/auth/login/', {
            'username': 'tutor_test',
            'password': 'ClaveSegura1$',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('errores', resp.data)


class PerfilYVerificacionTests(APITestCase):
    """GET /api/auth/me/ y POST /api/auth/verificar-contrasena/"""

    @classmethod
    def setUpTestData(cls):
        cls.tipo = TipoUsuario.objects.create(nombre='Director')
        cls.user = User.objects.create_user(
            username='dir', password='ClaveSegura1$',
            first_name='Ana', last_name='Pérez', tipo_usuario=cls.tipo,
        )

    def test_me_requiere_autenticacion(self):
        resp = self.client.get('/api/auth/me/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_devuelve_datos_del_usuario(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get('/api/auth/me/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['username'], 'dir')
        self.assertEqual(resp.data['tipo_usuario'], 'Director')

    def test_verificar_contrasena_correcta(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post('/api/auth/verificar-contrasena/',
                                 {'password': 'ClaveSegura1$'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['ok'])

    def test_verificar_contrasena_incorrecta(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post('/api/auth/verificar-contrasena/',
                                 {'password': 'otra'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
