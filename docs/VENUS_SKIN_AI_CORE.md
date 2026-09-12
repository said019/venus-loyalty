# Venus Skin IA: motor interno

Primera etapa del producto aprobado: módulo independiente para preparar contexto, solicitar una valoración estructurada a OpenAI y gestionar su revisión humana. No sustituye todavía la pantalla ni la app del Moji.

Entrega verificada el 11 de septiembre de 2026: **25/25 pruebas del motor aprobadas**, demostración sin red correcta y comprobación de diferencias sin errores de formato. Núcleo en `53df6c4`; correcciones de cancelación y recuperación en `a9f73b1`. La comprobación no incluye una llamada real al proveedor ni la suite completa de la aplicación.

## Demostración sin conexión

```sh
node scripts/demo-skin-advisor.mjs
node --test tests/skin-advisor.test.js
```

La demostración usa una imagen sintética y una respuesta ficticia. Bloquea las llamadas de red y termina en `pending_review`. No demuestra precisión visual o clínica y no puede aprobarse como valoración real.

## Uso interno

```js
import {
  createOpenAIProvider,
  createAdvisorSession,
} from './src/services/ai/skinAdvisor/index.js';

const provider = createOpenAIProvider({
  enabled: false, // La activación real requiere una decisión posterior.
  apiKey: '', // Solo configuración privada del servidor; nunca del navegador.
  model: 'gpt-6-astra', // Candidato configurable; evaluar disponibilidad y resultados.
});
const session = createAdvisorSession({
  provider,
  authorizeReview: async (actor) => {
    // Sustituir por autorización real del servidor, no un campo del cliente.
    return false;
  },
});
// await session.replaceInput(inputAutorizado);
// await session.generate();
// session.snapshot();
```

El adaptador no lee automáticamente variables de entorno, no cambia de proveedor y no reintenta llamadas pagadas. La clave, la activación y el consentimiento son controles distintos. `store: false` no es una promesa de retención cero por parte del proveedor.

La entrada de `replaceInput` contiene `record`, `activation`, `consent`, `patient`, `answers`, `photos`, `activeServices` y `protocols`. La referencia ficticia ejecutable está en `tests/fixtures/skin-advisor.js`; no usar sus marcas de autorización como sustituto de controles reales. Las fotos entran como bytes, nunca como una URL para descargar. Incluyen pertenencia verificada, zona, fecha, orientación y lateralidad; no se aceptan modos de luz distintos a blanca en esta etapa.

Para aprobar un borrador, el integrador llama a `session.approve({ inputVersion, actor })` con la versión de `snapshot()` y la identidad autenticada por el servidor. `authorizeReview(actor)` debe consultar permisos confiables. El módulo no convierte una casilla enviada por el navegador en autorización.

La revisión puede aportar `correctedAssessment` y `reviewNotes`. Las correcciones pasan por el mismo contrato; el borrador original se conserva separado del contenido corregido. Quien integre la pantalla o el informe debe mostrar la corrección aprobada cuando exista, sin atribuirla al modelo. El historial en memoria es acotado, no un archivo permanente: la integración deberá persistirlo antes de cerrar la sesión.

## Responsabilidades del servidor que lo integre

- Autenticar a la persona y autorizar acceso al expediente y a cada foto antes de construir la entrada. Una marca de pertenencia en JSON no autentica una petición HTTP.
- Recoger consentimiento específico para procesar las fotografías seleccionadas con OpenAI, con versión y fecha. El consentimiento general de fotografía no lo sustituye.
- Proporcionar únicamente servicios activos y protocolos revisados, con versiones. El modelo no crea protocolos autorizados.
- Mantener nombres, teléfonos, domicilios, firmas e identificadores internos fuera del contenido enviado. Revisar también el texto libre: una lista de campos permitidos no elimina todos los datos personales escritos dentro de una respuesta.
- Verificar permisos de quien aprueba; guardar el resultado, la versión exacta y la auditoría en almacenamiento persistente. Este motor mantiene sesiones en memoria y no implementa autenticación ni base de datos.
- Proteger las imágenes originales, definir conservación y borrado y mostrar claramente cuándo se enviarán a un proveedor externo.
- Tratar todos los textos de salida como contenido no confiable al mostrarlos: escapar HTML, no ejecutar enlaces o instrucciones y no convertir sugerencias en acciones automáticas. Aplicar cuotas y límites de concurrencia por usuario en la futura integración.

## Contrato y límites

El catálogo incluye las 13 áreas aprobadas, zonas del rostro, observaciones con referencias, hasta tres prioridades y hasta cinco preguntas. Un dato ausente permanece desconocido. Las propuestas de procedimientos solo pueden referenciar protocolos aprobados y servicios activos suministrados por el servidor.

La estructura y las referencias se validan localmente. Esto no verifica que una conclusión médica sea correcta ni vuelve al modelo inmune a instrucciones maliciosas dentro del texto. El resultado necesita revisión humana. No es un detector de cáncer ni un sistema completo de triaje; tampoco mide colágeno, hidratación, elasticidad, edad biológica o daño UV mediante una foto común.

Editar la entrada invalida borradores y aprobaciones anteriores. Una respuesta tardía no debe convertirse en el resultado vigente. Las generaciones simultáneas de una misma sesión no deben duplicar la llamada. Los errores y negativas del proveedor no publican una valoración anterior.

## Todavía pendiente

1. Conciliar la base de esta rama con los cambios de la aplicación más reciente, preservando ambos trabajos.
2. Integrar expediente, autorización, consentimiento, almacenamiento, pantalla de revisión y entrega a la clienta.
3. Integrar captura nativa sincronizada con luz blanca; mantener instalada la app original. Este módulo no controla luces ni cámara.
4. Evaluar con personal profesional y datos autorizados la calidad real, diferencias entre tonos de piel, repetibilidad y utilidad. Las pruebas de software no sustituyen esa evaluación.

No se hicieron migraciones, despliegues, llamadas reales a OpenAI ni cambios al importador histórico de Moji.

### Comprobación de la base existente

Antes de completar el motor, `node --test tests/leadTime.test.js` dio 8/9: el caso de día siguiente esperaba `future` y recibió `day`. La función existente consulta el día actual sin usar el `now` inyectado para esa comparación. Es un fallo previo y ajeno a Skin IA; no se modificó ni se considera resuelto. No ejecutar una integración o despliegue dando por verde toda la aplicación.

Referencias de API: [imágenes](https://developers.openai.com/api/docs/guides/images-vision), [salidas estructuradas](https://developers.openai.com/api/docs/guides/structured-outputs).
