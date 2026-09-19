# Plan personal en Venus

El usuario solicitó integrar y publicar A mi ritmo dentro de Venus el 13 de septiembre de 2026, sustituyendo la decisión anterior de mantenerlo exclusivamente local.

Ruta: `/mi-plan/`. Login dedicado: `/mi-plan/entrar`, usando el endpoint y la cookie de administrador existentes. La cuenta propietaria debe coincidir por ID, correo y rol, tanto en el JWT verificado como en la consulta actual de Admin. Otros administradores y recepción reciben 403. La base de datos inaccesible produce 503, nunca permite acceso.

Los archivos del plan están en `private/mi-plan`, fuera del static público. Un router allowlist protege HTML y todos los módulos, incluido el catálogo. Solo login HTML/JS/CSS contienen contenido genérico accesible sin sesión. No se publica el PDF original. Respuestas no-store, noindex, sin permiso de embedding ni CORS credenciado heredado. El cliente vuelve a comprobar sesión al recuperar visibilidad y periódicamente.

Los cambios y registros siguen en localStorage, en un namespace distinto al prototipo local. No hay sincronización entre dispositivos, migración de datos ni nueva tabla. El navegador compartido puede conservar registros; Mi plan permite borrarlos. El acceso a la aplicación web es privado, no un almacenamiento cifrado.

Se copia el prototipo independiente 473d824 y se adapta el prefijo de assets, aviso de privacidad y comprobación de sesión. El prototipo original permanece sin cambios.

## Ayuda opcional con Claude

El usuario pidió conectar el Claude existente. En Cambiar se muestran las cantidades equivalentes sin IA y se añade una consulta opcional que requiere consentimiento explícito. El servidor verifica propietario, origen exacto, pregunta de máximo 400 caracteres y limita 20 consultas por hora/proceso y una simultánea. Se reutiliza ANTHROPIC_API_KEY, sin modificar el análisis de piel.

**Desde el 18-sep-2026 Claude pone las cantidades** (pedido del dueño: "que lo haga la IA"). Claude recibe el texto de preferencia, el ingrediente con su cantidad y aporte, el aporte por equivalente de cada grupo (SMAE, anexo UNAM) y el catálogo con aporte documentado (id, nombre, unidad, porción, grupo). No recibe el PDF, identidad adjunta ni historial. Devuelve hasta tres `{id, quantity}` y puede elegir de cualquier grupo, incluida la carne deshebrada de c1 que en la lista manual está retenida.

La app no le cree a ciegas. `checkAIProposal` (engine.js, el mismo en servidor y navegador) calcula el aporte de lo original y de lo propuesto con la tabla del SMAE. Entre alimentos de la misma familia (proteínas de origen animal entre sí, cereales entre sí, etc.) exige conservar el nutrimento que define el equivalente: la proteína en carnes y los hidratos en cereales, con un margen de 0.75 a 1.33×. Entre familias distintas exige energía de 0.5 a 1.5×. Lo que no pasa se descarta y no se muestra. Cada propuesta enseña el aporte lado a lado (kcal, proteína, grasa, hidratos), necesita confirmación y se vuelve a comprobar al leerla del almacenamiento. Ingredientes sin cantidad o sin aporte documentado (sal, ajo, barras de marca, la cebolla medida en piezas) no llaman al proveedor. Modelo `claude-sonnet-5` (se puede cambiar con `PERSONAL_PLAN_AI_MODEL`), 4000 tokens porque razona antes de contestar (con 400 se quedaba sin respuesta), 25 segundos de límite, sin reintentos. Los errores no revelan respuestas, preguntas ni claves en logs. Las equivalencias manuales del mismo subgrupo siguen funcionando si Claude falla.

Prueba real con la clave de producción (18-sep): deshebrada 90 g → pechuga 90 g (misma proteína, 12 g menos de grasa) o 1.5 muslos; champiñón ¾ taza → 15 g de panela; res 90 g → 90 g de salmón, trucha o róbalo. Tiempo de respuesta de 1 a 13 s. Antes de la regla por familia, Claude igualaba calorías y proponía 169 g de pollo (casi el doble de proteína).

Entrega Claude: commit 28384d6, despliegue f3930f8e-37fa-4de4-ad7c-c20efd831745 SUCCESS. 16 pruebas de acceso/IA aprobadas y navegador móvil del router montado aprobado. Consulta real sintética «Quiero naranja» con la clave existente devolvió orange; el motor calculó 4 piezas sin datos identificativos. El flujo en producción con la sesión del propietario se verifica al entrar; no se generó una sesión falsa para probarlo.

Pruebas de acceso: `node --test tests/personal-plan-access.test.js`. Cubren login genérico, acceso anónimo al catálogo bloqueado, JWT inválido, otro administrador, recepción, identidad inconsistente, propietario válido, revocación del rol, caída de base de datos, paths fuera del allowlist y reglas de intercambio copiadas.

Despliegue por archivo completo del commit, no por el worktree que contiene archivos personales no versionados. Producción anterior: ae4d4488-f861-4f6b-b0fa-f479502a98a5. No se modifica la configuración de bases de datos o claves. Comprobar health, login y 401 del catálogo tras desplegar; validación con la sesión real del usuario se hace al entrar, sin fabricar una sesión de producción.

## Entrega verificada

Commit desplegado: 325fea3. Despliegue activo a9705d0a-1083-4f01-8c82-7b8772e99e72, SUCCESS. La primera carga reportó timeout local pero fue recibida por Railway; el segundo despliegue del mismo contenido quedó activo. Archivo de entrega: /tmp/venus-personal-plan.DbmT9B.

10 pruebas de integración y permisos aprobadas. Prueba de navegador móvil del router montado bajo `/mi-plan/`: render y confirmación de cambio aprobados. Dominio real: health 200, entrada privada 302 al login, login HTML/JS 200, catálogo/app/session anónimos 401, ruta física privada 404, Moji conserva su redirección. La sesión real del propietario queda por probar por el usuario al iniciar sesión. No se hizo push a GitHub; se publicó directamente en Railway desde el commit local autorizado.
