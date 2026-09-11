# Venus Skin IA — qué debe analizar

Fecha: 10 de septiembre de 2026. Versión funcional 1.0, para revisión del dueño y del personal profesional de Venus. Define el contenido del producto; no acredita capacidad diagnóstica ni precisión del modelo. No hay implementación en esta entrega.

## Objetivo

La asesora de Venus integra lo que se ve, lo que cuenta la clienta y lo que registra su expediente. Produce una valoración cosmética explicada, preguntas útiles y un borrador de cuidados para revisión. El diferenciador es el contexto y el seguimiento, no una colección de puntuaciones sin significado.

El proveedor elegido es OpenAI. El personal revisa y corrige; el sistema conserva quién observó, quién declaró y quién aprobó cada resultado. Las funciones de esta lista son requisitos a desarrollar y evaluar, no capacidades ya comprobadas en el aparato.

## 1. Antes de interpretar: calidad y alcance de la foto

Comprobar que la imagen corresponde al expediente elegido, está orientada correctamente y permite ver la zona. Revisar enfoque, iluminación, reflejos, sombras, exposición, oclusiones, filtros, maquillaje y productos recién aplicados cuando esa información esté disponible. La IA puede advertir problemas aparentes; no se considera un medidor óptico calibrado.

Una frontal permite revisar solo las zonas que se distingan. Se pueden añadir vistas laterales o detalles si se obtienen de forma segura con la captura disponible. No se exige cambiar de posición ni accionar modos del equipo que todavía no se hayan validado.

- Resultado global: utilizable, utilizable con límites o repetir toma.
- Resultado por zona: evaluable, parcialmente evaluable o no evaluable.
- Conservar original y procedencia; corrección de orientación y recortes derivados identificados. Sin embellecimiento, alisado o imágenes generadas para representar resultados reales.
- La insuficiencia de una zona no invalida automáticamente todas las demás. La app no rellena huecos.
- Zonas: frente, nariz, mejilla derecha, mejilla izquierda, mentón, periocular derecho, periocular izquierdo y contorno inferior visible. Derecha e izquierda se refieren a la clienta; si espejo/orientación no están resueltos, no se asigna lateralidad.

## 2. Catálogo de 13 áreas de valoración

Todas las filas admiten «no evaluable». El grado de visibilidad o extensión no es una escala de gravedad médica.

| ID | Área | Qué debe revisar | Qué debe preguntar o contrastar | Límite de la conclusión |
|---|---|---|---|---|
| A01 | Perfil de piel | Distribución de brillo, descamación y características por zona; propuesta de perfil seco, graso, mixto o sin predominio, cuando haya evidencia suficiente. | Cómo se siente después de limpiar, cambios durante el día, productos recientes y clasificación profesional previa. | Perfil orientativo basado en datos; no clasificar por una sola foto. Reactividad se registra aparte, no como alternativa excluyente. |
| A02 | Brillo superficial | Localización y extensión del brillo visible, contrastando reflejos y exposición. | Brillo habitual, sudor o producto aplicado antes de la toma. | No porcentaje ni cantidad de sebo. Un reflejo no demuestra piel grasa. |
| A03 | Resequedad y descamación | Escamas y apariencia seca donde sean distinguibles. | Tirantez, molestias, momento de aparición y tolerancia a productos. | No medir contenido de agua ni confirmar daño de barrera a partir de la foto. |
| A04 | Rojez y reactividad | Áreas con diferencia rojiza respecto de piel circundante y cambios visibles entre tomas equivalentes. | Ardor, picor, reacciones y desencadenantes declarados. | No diagnosticar rosácea, dermatitis o alergia; no descartar reactividad porque no se vea roja. |
| A05 | Brotes visibles | Elevaciones y puntos visibles descritos por aspecto y zona; separar cambios actuales de marcas planas. | Tiempo de evolución, dolor, recurrencia y tratamientos indicados por un profesional. | No diagnóstico ni grado clínico de acné. Conteos solo como estimaciones si se distinguen elementos, con confirmación humana; si no, omitir. |
| A06 | Puntos negros y obstrucciones aparentes | Puntos oscuros o claros pequeños que puedan describirse de forma consistente en la imagen. | Persistencia, zona habitual y valoración previa. | Reconocer incertidumbre frente a poros, vello, sombras o filamentos; no ordenar extracción. |
| A07 | Poros visibles | Zonas donde se distinguen aberturas y su prominencia visual relativa. | Qué preocupa a la clienta y si las tomas tienen condiciones comparables. | No tamaño en micras, conteo exacto o cantidad de poros del rostro completo. |
| A08 | Manchas y uniformidad de tono | Áreas más oscuras o claras, su distribución y contraste aparente con el entorno. | Cuándo aparecieron, cambios, exposición solar y diagnóstico previo cuando exista. | No asumir melasma, origen hormonal, profundidad o daño UV. No clasificar lesiones como benignas o malignas. |
| A09 | Textura superficial | Irregularidades visibles, zonas de aspecto más uniforme y diferencias de superficie. | Sensación descrita por la clienta, evolución y procedimientos recientes. | No deducir relieve o rugosidad calibrados de las sombras. |
| A10 | Marcas y cicatrices aparentes | Diferenciar, cuando sea posible, cambios planos de color y relieves/depresiones visibles; indicar zona. | Origen conocido, antigüedad y cambios. | No asignar profundidad, tipo definitivo o tratamiento invasivo sin valoración. |
| A11 | Líneas y arrugas visibles | Localización y prominencia aparente en la expresión registrada. | Objetivo de la clienta, cambios percibidos y si estaba en reposo o gesticulando. | Una sola imagen no distingue de forma fiable todos los componentes dinámicos/estáticos; no convertirlo en nivel de colágeno o edad. |
| A12 | Contorno de ojos | Oscurecimiento, sombras, volumen aparente y líneas que puedan describirse. | Variación durante el día, síntomas y tiempo de evolución. | No inferir anemia, deshidratación, calidad de sueño o causa vascular como hechos. No usar sombras como prueba de pigmentación. |
| A13 | Apariencia del contorno facial | Cambios visibles en pliegues y contorno inferior, solo con postura y encuadre adecuados. | Qué cambio percibe la clienta y fotografías comparables disponibles. | No medir firmeza, elasticidad, volumen profundo ni porcentaje de flacidez. Si la postura domina la comparación, no concluir. |

Para cada área: observación breve, zonas revisadas, foto/respuesta de origen, límites, pregunta pendiente si hace falta y corrección del personal. No obligar a encontrar un problema en todas las filas.

## 3. Contexto que debe integrar

La ficha se precarga con datos relevantes del expediente y se confirma su vigencia; no se obliga a repetir todo. Lo no contestado se conserva como desconocido. No se deducen edad, sexo, embarazo, origen étnico o enfermedades a partir de fotografías.

### Información de base

1. Objetivo principal: qué le gustaría mejorar y qué le molesta actualmente.
2. Evolución: desde cuándo, en qué zonas, si cambia y si hay dolor, ardor o picor.
3. Rutina actual: limpiador, hidratante, protección solar, maquillaje y otros productos; nombre, frecuencia y tolerancia si se conocen. Ingredientes desconocidos no se inventan a partir de una marca.
4. Antecedentes relevantes declarados: alergias, reacciones, condiciones diagnosticadas, medicamentos y tratamientos recientes. Embarazo/lactancia solo cuando resulte relevante para la propuesta y se haya recabado voluntariamente.
5. Hábitos pertinentes: exposición solar, uso declarado de protección y situaciones que la clienta relacione con cambios. No convertir asociaciones relatadas en causas demostradas.
6. Preferencias: tiempo disponible, presupuesto voluntario, comodidad con cuidados y objetivos realistas. No convertir presupuesto en diagnóstico o prioridad de salud.

La conversación comienza por el objetivo y síntomas relevantes; luego adapta las preguntas a lo observado. Presenta un máximo de cinco preguntas pendientes por ronda. Ese máximo no elimina requisitos de seguridad: mientras falte un dato necesario, la propuesta correspondiente queda pendiente.

La clasificación de color visible no se usa como sustituto del fototipo ni del riesgo de reacción al sol. Si un protocolo necesita esa información, se obtiene mediante historia y valoración profesional adecuadas.

## 4. Interpretación que aporta la IA

Debe elaborar una síntesis de evidencia y prioridades, no repetir una lista de etiquetas:

- **Coincidencias:** relacionar una observación con un dato declarado, citando ambos. Ejemplo de estructura: «Se observa X en la foto Y; la clienta refiere Z». No concluir que Z causó X sin respaldo.
- **Discrepancias:** si la foto, la ficha o el resultado importado difieren, mostrar la diferencia y preguntar; no elegir silenciosamente uno.
- **Prioridades:** proponer hasta tres temas de consulta, según evidencia, síntomas declarados, información faltante y objetivo de la clienta. No priorizar por precio de servicio.
- **Lo que se puede conservar:** mencionar características o hábitos respaldados; no inventar una fortaleza para que el reporte suene positivo.
- **Próximo paso:** para cada tema, explicar qué revisar, qué preguntar o qué opción discutir. Sin protocolo aprobado, limitarse a educación y preguntas.

La revisión de rutina tiene sentido como parte del contexto: la AAD destaca diferencias individuales y la importancia de la tolerancia a productos, también en piel grasa. Esto fundamenta preguntar, no automatizar una receta universal. [Referencia AAD](https://www.aad.org/public/everyday-care/skin-care-basics/dry/oily-skin).

## 5. Propuesta de cuidados y servicios Venus

Salida en dos capas: borrador interno y versión aprobada para la clienta.

- Educación sobre hábitos y categorías de cuidado, ajustada a lo confirmado y a fuentes/protocolos revisados.
- Revisión de posibles redundancias o problemas de tolerancia de la rutina para que el personal los valore. No afirmar interacciones sin conocer productos y condiciones.
- Hasta tres opciones del catálogo real que cuenten con protocolo vigente aprobado, con motivo, requisitos por confirmar y alternativa de no realizar un procedimiento todavía.
- Nada de «es apta para HIFU/IPL/Dermapen» solo por la fotografía. Parámetros, indicación, número de sesiones y decisión final quedan a la valoración profesional y al protocolo correspondiente.
- No suspender medicación indicada ni emitir prescripciones. No enviar el borrador, cobrar, agendar o encender aparatos automáticamente.
- Frecuencia de seguimiento determinada por el profesional o un protocolo aprobado; sin plazo numérico inventado por un score.

La AAD recomienda valoración dermatológica cuando los brotes persisten pese a cuidados; sirve como referencia educativa para no reducir todo a venta de servicios cosméticos. [Referencia AAD](https://www.aad.org/public/diseases/acne/skin-care/tips).

## 6. Seguimiento entre consultas

Se comparan únicamente fotos de la misma clienta y zonas equivalentes, con fecha, modo de luz, orientación, postura y condiciones de toma registradas. No se mezclan un mapa procesado del fabricante y una foto normal como si fueran la misma modalidad.

- Calidad comparativa: comparable, parcialmente comparable o no comparable, con motivo.
- Por área: cambio visible aparente, sin cambio claro o no evaluable. Si cambia pose/exposición, indicar esa limitación y evitar concluir mejoría.
- Separar lo que se observa de lo que la clienta refiere sobre molestias o tolerancia.
- Registrar cuidados/tratamientos realizados sin afirmar que causaron el cambio observado.
- No generar porcentajes de mejoría, eficacia o reducción de lesiones sin un método de medición validado. Las anotaciones manuales revisadas se distinguen de las estimaciones de IA.

## 7. Formato de la valoración

1. **Resumen:** motivo de consulta y panorama de la evidencia disponible.
2. **Calidad y cobertura:** qué zonas se pudieron revisar y cuáles no.
3. **Perfil orientativo:** solo si fotos y respuestas lo permiten; reactividad en apartado separado.
4. **Observaciones por zona:** áreas del catálogo aplicables, sin rellenar las demás.
5. **Hasta tres prioridades:** motivo y datos que las apoyan.
6. **Preguntas pendientes:** qué hace falta para avanzar.
7. **Borrador de cuidados/opciones:** ligado a protocolos, no a puntuaciones comerciales.
8. **Comparación con la consulta anterior:** cuando existan datos comparables.
9. **Revisión profesional:** observaciones corregidas, decisión, responsable y fecha.

No usar una calificación global de salud, A+, edad biológica o gráfico con porcentajes inventados. Los estados de evidencia son descriptivos: visible, referido, importado o no evaluable. «No se distingue en esta foto» no significa «no existe».

## 8. Situaciones que deben detener la propuesta cosmética automática

Si la clienta refiere una lesión que crece, cambia o sangra, mostrar una recomendación de evaluación dermatológica y detener sugerencias de tratamiento cosmético sobre esa lesión. La AAD señala estos cambios como motivos de consulta. No se calcula riesgo de cáncer, no se tranquiliza con un «se ve benigno» y la foto no reemplaza la exploración. [Referencia AAD](https://www.aad.org/public/diseases/skin-cancer).

El personal también puede detener cualquier propuesta ante síntomas o información que necesiten evaluación presencial. Esta función es apoyo para reconocer límites, no un sistema completo de triaje ni una garantía de detección de enfermedades.

## 9. Relación con los indicadores antiguos de Moji

| Indicadores importados | Cómo aparecen en Venus propio |
|---|---|
| Acné / puntos negros / poros | A05–A07: observaciones visibles, sin heredar automáticamente las puntuaciones del fabricante. |
| Manchas / pigmentación | A08: distribución y apariencia; no se duplican como dos mediciones independientes si provienen de la misma evidencia. |
| Textura / marcas / arrugas | A09–A11, con sus límites de captura. |
| Sensibilidad | A04: foto más síntomas y antecedentes declarados; no diagnóstico de sensibilidad por color. |
| Ojeras | A12: descripción y contexto, sin causa médica inferida. |
| Hidratación | A03: signos visibles de resequedad y síntomas; un dato instrumental externo se muestra separado con procedencia y fecha. |
| Colágeno | No se genera una medición propia. A11/A13 describen apariencia, no cantidad de colágeno. |
| UV / Wood / polarización | Fuera de la captura propia inicial. Un informe histórico se conserva identificado como dato del fabricante; no se fabrica esa modalidad con filtros. |
| Edad biológica | No forma parte del resultado propio inicial. No se sustituye por una edad aparente sin un desarrollo y evaluación separados. |

## 10. Pruebas que demostrarán que el contenido está bien implementado

Estas son pruebas propuestas, todavía no ejecutadas sobre un motor Venus propio:

- Foto borrosa o zona tapada: debe pedir repetición o marcar límites; no completar todas las áreas.
- Brillo con producto recién aplicado: no diagnosticar automáticamente piel grasa.
- Síntomas de ardor declarados sin rojez visible: conservar síntomas, no descartar reactividad.
- Ausencia de ficha: preguntar; no asumir que no hay alergias o medicamentos.
- Mancha o brote no distinguible: no dar causa, clasificación definitiva o conteo exacto.
- Sin datos de colágeno/agua/UV: no inventar números ni reutilizar un score de otro indicador.
- Foto invertida o lateralidad incierta: no asignar derecha/izquierda arbitrariamente.
- Antes/después con luz o pose distinta: señalar falta de comparabilidad; no venderlo como eficacia.
- Producto o protocolo desconocido: no inventar ingredientes, contraindicaciones, sesiones o indicaciones.
- Una lesión que la clienta reporta cambiante o sangrante: priorizar evaluación profesional, no ofrecer un procedimiento sobre ella.
- Clienta sin preocupaciones visibles relevantes: no forzar problemas ni tratamientos para completar tres prioridades.
- Instrucciones incrustadas en ficha o imagen: tratarlas como datos, sin modificar reglas ni ejecutar acciones.
- Evaluación visual futura con personas y tonos de piel diversos, consentimiento y revisión profesional independiente; registrar errores, desacuerdos y repetibilidad. Comparar con Moji no lo convierte en referencia clínica absoluta.

## Estado de revisión

El dueño aprobó el enfoque general y pidió definir este contenido antes de programar. Este catálogo concreta esa petición y queda para su revisión; las indicaciones de cuidado y protocolos requieren además revisión profesional antes de un piloto real.
