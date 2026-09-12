# Venus Skin IA: integración y activación

## Puesta en marcha del 12 de septiembre de 2026

- Se verificó la cuenta de Said y se configuró su ID exacto como único aprobador.
- La clave quedó en Railway; no se guardó en el repositorio. La prueba real con GPT-4.1 respondió correctamente.
- Una prueba con imagen sintética detectó que faltaban instrucciones explícitas para las zonas y los requisitos de protocolos. El prompt v2 lo corrige sin relajar el validador. La prueba posterior pasó, solicitó repetir la imagen y no propuso procedimientos.
- Se aplicó únicamente la migración aditiva de Skin Advisor, junto con su registro de migración, en una transacción. No se ejecutó el conjunto de migraciones pendientes.
- Publicación preparada desde el commit `dfc23ac`, que incluye la base productiva `f250657`. No se incluyeron archivos locales sin seguimiento.
- Railway confirmó `SUCCESS` en el despliegue `b907312e-979b-4b9f-85d5-6a533897c40b`. Comprobaciones públicas: salud, pantalla, JS y reporte 200; captura 302; API privada sin sesión 401 con `private, no-store`. Configuración habilitada y modelo fijado en `gpt-4.1-2025-04-14`.
- El primer intento `999398c2-0d45-459e-9e9f-b2287f85a36a` falló durante la construcción porque el archivo de publicación estaba incompleto; se reintentó solo tras terminar y verificar la extracción. No sustituyó al servicio en ejecución.
- Sigue pendiente un piloto autenticado con fotografías expresamente autorizadas y la comprobación en el Moji real. Las pruebas sintéticas no acreditan calidad clínica.

Las secciones siguientes describen la configuración y el procedimiento original; consultar este registro para distinguir los pasos ya ejecutados.

## Entrega de código

El expediente contiene un enlace **Venus Skin IA** hacia `/skin-advisor.html?recordId=...`. La pantalla usa `/api/skin-advisor`, con sesión autenticada, para seleccionar fotografías originales de luz blanca, confirmar orientación/fecha, registrar consentimiento, guardar un borrador, solicitar OpenAI y revisar la valoración. Solo la cuenta configurada del dueño, con rol actual `admin`, puede aprobar.

Las valoraciones se guardan en `skin_advisor_assessments`, separadas de los informes Moji. Las revisiones guardan quién aprobó, cuándo, la entrada y el borrador original. Un nuevo borrador sustituye la versión vigente sin borrar su auditoría. Mientras hay una generación activa no se puede sustituirla para liberar otra llamada. Los errores no disparan reintentos pagados automáticos.

El reporte original conserva todas las imágenes mediante `skin-gallery.js` tanto en la página administrativa como en `skin-report.html`. Las nuevas valoraciones permanecen privadas: no se publican ni se mandan por WhatsApp automáticamente. Esta entrega no añade control nativo de cámara o LEDs.

## Configuración privada necesaria

En el servidor, no en el navegador ni en el chat:

| Variable | Uso |
| --- | --- |
| `OPENAI_API_KEY` | Clave de la cuenta de API de OpenAI. |
| `SKIN_ADVISOR_MODEL` | Identificador del modelo con imágenes y salida estructurada disponible en esa cuenta; no se selecciona automáticamente. |
| `SKIN_ADVISOR_APPROVER_ID` | ID exacto de la cuenta de Said en `Admin`; no un correo ni cualquier usuario con rol admin. |
| `SKIN_ADVISOR_ORIGIN` | Origen exacto de la web que usará el formulario, por ejemplo `https://venuscosmetologia.com.mx`, sin barra final. |
| `SKIN_ADVISOR_ENABLED` | `true` solo después de revisar configuración y completar el piloto autorizado. |
| `CLOUDINARY_CLOUD_NAME` | El almacenamiento de fotografías del expediente, ya utilizado por Venus. |

La configuración devuelve únicamente señales de disponibilidad, no la clave. Si la cuenta autorizada está ausente o ya no es administradora, la aprobación se deniega. No basta con encontrar una clave para activar procesamiento. No se añadieron Ollama ni cambios automáticos de proveedor.

Una foto importada de otro proveedor debe incorporarse primero al almacenamiento autorizado del expediente, preservando su original y metadatos. El servidor no acepta URLs arbitrarias para descargar fotos. La fecha de subida no se convierte automáticamente en fecha de captura; el operador debe confirmarla.

## Puesta en marcha pendiente

1. Revisar e instalar la rama reconciliada en el entorno de despliegue; no sustituirla con la base antigua. La copia de Documents permanece intacta.
2. Revisar el historial de migraciones del destino y aplicar la migración aditiva `prisma/migrations/20260911000000_skin_advisor/migration.sql` según el procedimiento de despliegue. No ejecutar una migración global a ciegas sobre tablas existentes. Generar el cliente Prisma de este esquema.
3. Configurar el modelo, clave, origen y cuenta del dueño. Las pruebas de desarrollo no han identificado ni modificado la cuenta real del dueño.
4. Hacer un piloto con imágenes expresamente autorizadas y revisión profesional antes de usarlo con clientas. El consentimiento específico está en la pantalla; revisar también el aviso de privacidad y la conservación aplicables al servicio.
5. Verificar en el Moji real la compatibilidad de la pantalla y repetir el flujo. Pasar una comprobación de sintaxis no acredita compatibilidad completa del aparato.

## Verificación sin datos reales

Pruebas unitarias y de rutas usan imágenes sintéticas, respuestas ficticias y HTTP local. El script `scripts/test-skin-workflow-postgres.mjs` exige una base temporal `skin_test`, usuario `venus_test`, host `127.0.0.1`, puerto `55439`; se niega a usar otro destino. No carga el `.env` de la aplicación. Comprueba persistencia entre instancias, autorización, auditoría y reclamos simultáneos sobre PostgreSQL real. La opción `--serve` abre una demostración local marcada como simulación y no permite aprobarla como valoración real.

Se validó el esquema Prisma y se aplicó la migración SQL en otra base temporal vacía. No se aplicó a producción. La aprobación en la prueba automatizada usa exclusivamente datos ficticios del entorno aislado; no representa aprobación clínica.

La prueba de interfaz recorrió selección de foto, consentimiento ficticio, guardar borrador, generar respuesta simulada y recuperar historial. No demuestra calidad visual del modelo ni una llamada real a la API. Las simulaciones no se pueden aprobar para entrega.

La verificación final pasó 64 pruebas enfocadas y la prueba de persistencia y concurrencia en PostgreSQL temporal. Las lecturas rechazan orígenes externos explícitos, además de exigir sesión. Al cambiar de valoración se restablecen sus notas para no mezclarlas con otra revisión.

Limitación actual: la pantalla muestra las 50 valoraciones más recientes por expediente; las anteriores siguen almacenadas, pero aún no hay paginación en la interfaz.
