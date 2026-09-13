# Plan personal en Venus

El usuario solicitó integrar y publicar A mi ritmo dentro de Venus el 13 de septiembre de 2026, sustituyendo la decisión anterior de mantenerlo exclusivamente local.

Ruta: `/mi-plan/`. Login dedicado: `/mi-plan/entrar`, usando el endpoint y la cookie de administrador existentes. La cuenta propietaria debe coincidir por ID, correo y rol, tanto en el JWT verificado como en la consulta actual de Admin. Otros administradores y recepción reciben 403. La base de datos inaccesible produce 503, nunca permite acceso.

Los archivos del plan están en `private/mi-plan`, fuera del static público. Un router allowlist protege HTML y todos los módulos, incluido el catálogo. Solo login HTML/JS/CSS contienen contenido genérico accesible sin sesión. No se publica el PDF original. Respuestas no-store, noindex, sin permiso de embedding ni CORS credenciado heredado. El cliente vuelve a comprobar sesión al recuperar visibilidad y periódicamente.

Los cambios y registros siguen en localStorage, en un namespace distinto al prototipo local. No hay sincronización entre dispositivos, migración de datos ni nueva tabla. El navegador compartido puede conservar registros; Mi plan permite borrarlos. El acceso a la aplicación web es privado, no un almacenamiento cifrado.

Se copia el prototipo independiente 473d824 y se adapta el prefijo de assets, aviso de privacidad y comprobación de sesión. El prototipo original permanece sin cambios. No hay IA remota ni procesamiento adicional de datos.

Pruebas de acceso: `node --test tests/personal-plan-access.test.js`. Cubren login genérico, acceso anónimo al catálogo bloqueado, JWT inválido, otro administrador, recepción, identidad inconsistente, propietario válido, revocación del rol, caída de base de datos, paths fuera del allowlist y reglas de intercambio copiadas.

Despliegue por archivo completo del commit, no por el worktree que contiene archivos personales no versionados. Producción anterior: ae4d4488-f861-4f6b-b0fa-f479502a98a5. No se modifica la configuración de bases de datos o claves. Comprobar health, login y 401 del catálogo tras desplegar; validación con la sesión real del usuario se hace al entrar, sin fabricar una sesión de producción.

## Entrega verificada

Commit desplegado: 325fea3. Despliegue activo a9705d0a-1083-4f01-8c82-7b8772e99e72, SUCCESS. La primera carga reportó timeout local pero fue recibida por Railway; el segundo despliegue del mismo contenido quedó activo. Archivo de entrega: /tmp/venus-personal-plan.DbmT9B.

10 pruebas de integración y permisos aprobadas. Prueba de navegador móvil del router montado bajo `/mi-plan/`: render y confirmación de cambio aprobados. Dominio real: health 200, entrada privada 302 al login, login HTML/JS 200, catálogo/app/session anónimos 401, ruta física privada 404, Moji conserva su redirección. La sesión real del propietario queda por probar por el usuario al iniciar sesión. No se hizo push a GitHub; se publicó directamente en Railway desde el commit local autorizado.
