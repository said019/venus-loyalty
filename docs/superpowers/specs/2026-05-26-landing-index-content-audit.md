# Auditoría de contenido — Landing Venus (index.html)

**Fecha:** 2026-05-26
**Tipo:** Product brief (business-analyst)
**Objetivo:** Reducir la información de la landing y reordenarla para que la primera impresión convierta a agendar / lealtad / café.

---

## 1. Contexto

`public/index.html` es la home unificada de Venus Cosmetología (boutique en San Juan del Río), servida en `venuscosmetologia.com.mx`. El dueño percibe **demasiada información**. Los datos cuantitativos lo confirman:

| Métrica | Valor actual | Benchmark para landing boutique |
|---|---|---|
| Palabras visibles en `<body>` | **8,079** | 800–1,500 |
| Secciones de contenido | **14** | 5–7 |
| Secciones con CTA accionable | **5 de 14** | ≥80% |
| Items en navbar | 5 (Rituales, Experiencia, Lealtad, Ubicación, Agendar) | OK |
| Secciones "huérfanas" del navbar | **10** | 0 |

10 de 14 secciones **no existen para el navegador** — el visitante solo llega ahí scrolleando. Cada sección extra es un costo de atención que rara vez paga.

## 2. Problema central

La página **trata de hacer todo a la vez** (presentar marca + vender servicios + reclutar membresía + anunciar tienda futura + dar comunidad + mostrar testimonios + ubicación + crear tarjeta), y **el visitante no sabe qué se espera de él**. Como resultado:

- **Hero ambiguo:** *"Venus: Un espacio para volver a ti"* no comunica QUÉ hace el negocio. Una clienta nueva tarda 3 scrolls en entender que ofrecen cosmetología.
- **Conflicto de jerarquía:** #membresia y #lealtad venden lo mismo (programa de fidelización) con copy distinto.
- **Contenido aspiracional puesto como real:** #tienda dice literalmente *"Dejamos preparado el lenguaje para que cuando Venus venda más online, se sienta curado y no improvisado"* — es nota interna visible al usuario.
- **Café subutilizado:** mencionado en 4 lugares dispersos (imagen, lista, shop-card, footer) pero **sin sección propia** pese a ser uno de los 3 objetivos del negocio.
- **"Testimonios" sin testimonios:** copy genérico + link a Google Maps. No hay quotes reales.

## 3. Perfiles de visitante (Jobs-to-be-Done)

| Perfil | Job principal | Lo que necesita en la landing |
|---|---|---|
| **A. Clienta nueva curiosa** | Entender QUÉ es Venus y si le sirve | Headline claro · foto del estudio · 4-6 servicios con precio · reseñas reales · CTA agendar |
| **B. Clienta con dolor específico** ("quiero limpieza facial") | Ver servicios + agendar rápido | Servicios con precio/duración accesibles desde arriba; CTA Agendar persistente |
| **C. Clienta de regreso (lealtad)** | Acceder a su tarjeta | Link **"Mi tarjeta"** en navbar (ya existe ✅) |
| **D. Curiosa del café** | Saber si puede pasar sin cita | Sección con foto del café, horario, qué se sirve |
| **E. Buscando regalo / gift card** | Ver opciones de regalo | Mini-bloque dentro de Servicios o Lealtad (no tienda futura) |

## 4. Inventario actual y diagnóstico por sección

| Sección | Función declarada | CTAs | Diagnóstico | Acción |
|---|---|---|---|---|
| **Hero** | "Espacio para volver a ti" | 2 | Mensaje **demasiado abstracto**; no menciona "cosmetología", "facial" ni "depilación" hasta scroll. | **Reescribir headline** |
| **(sin id)** venus-proof | Motivos para elegir Venus | 0 | Útil como sub-hero (trust signals). | **Mantener** |
| **photo-strip** | Galería | 0 | Refuerza tono visual. | **Mantener (achicar)** |
| **#rituales** | Servicios | 2 | El **núcleo de conversión**. Necesita precio + duración visibles, posiblemente categorizado. | **Mantener / fortalecer** |
| **#filosofia** | "Tu piel no se corrige, se acompaña" | 0 | Prosa de marca sin acción. | **Fundir en hero/experiencia** |
| **#experiencia** | "Experiencia del estudio" | 0 | Prosa similar a #filosofia. | **Fundir** |
| **#comunidad** | "Comunidad Venus" | 0 | Tercer bloque de vibes. **Triplicación del mismo mensaje.** | **Cortar (o fundir)** |
| **#primera-visita** | "Ven sin ansiedad" | 2 | Útil funcional para clienta nueva. | **Mantener (compacto)** |
| **#membresia** | "Que Venus se sienta como un club" | 0 | **Conflicto con #lealtad.** Vago, sin estructura de niveles/precios reales. | **Fusionar en #lealtad** |
| **#agenda** | Cómo agendar | 2 | Explica el flujo. Redundante si CTA "Agendar" es persistente. | **Cortar (CTA suficiente)** |
| **#tienda** | "Tienda futura" | 0 | **Texto aspiracional visible al cliente.** Cero valor hoy. | **Cortar** |
| **#testimonios** | "Lo que más se nota..." | 0 | Sin testimonios reales, solo link a Google. | **Reforzar con quotes o fundir** |
| **#ubicacion** | Llegar/horarios | 3 | Funcional necesario. | **Mantener** |
| **#lealtad** | Crear/login tarjeta | 0 (pero TIENE las tabs) | Núcleo del programa de fidelización. | **Mantener (con merge de #membresia)** |

**Diagnóstico ejecutivo:** ~40% del scroll es prosa de marca sin acción (filosofía + experiencia + comunidad + tienda + agenda redundante). Eso es lo que se siente como "demasiada información".

## 5. Recomendaciones — qué cortar, qué dejar, qué reordenar

### 5.1 Cortes inmediatos (reducción del ~40%)

| Acción | Sección | Justificación |
|---|---|---|
| ❌ **Cortar** | `#tienda` (líneas 2598–2622) | Es texto placeholder admitido. No vende nada. |
| ❌ **Cortar** | `#agenda` (líneas 2587–2597) | El CTA "Agendar" en navbar y hero hace innecesario explicar el flujo aquí. |
| 🔄 **Fundir** | `#filosofia` + `#experiencia` + `#comunidad` → **una sola "Experiencia Venus"** | Triplican el mismo mensaje sentimental. Combinarlos en un bloque de 3 puntos visuales. |
| 🔄 **Fundir** | `#membresia` → dentro de `#lealtad` | Compiten por el mismo trabajo (fidelización). #lealtad es el que tiene la herramienta real (crear/buscar tarjeta). |

**Impacto estimado:** de 14 secciones → **6 secciones**. De 8,079 palabras → ~3,000–3,500.

### 5.2 Adiciones

| Agregar | Por qué |
|---|---|
| ➕ **Sección "El Café" con identidad propia** | Es 1 de los 3 objetivos del negocio y hoy está fragmentado en 4 menciones marginales. Foto grande, horario, qué se sirve, "pasa sin cita". |
| ➕ **Reseñas reales (3 quotes con nombre)** dentro de #testimonios | La prueba social genuina convierte mejor que "ve nuestras reseñas en Google". Pídeles a 3 clientas frecuentes una línea y úsalas con su nombre. |

### 5.3 Hero — propuesta de reescritura

Headline actual:
> "Venus: Un espacio para volver a ti."

Problema: NO comunica qué hace el negocio. Una persona que llega via Google buscando "limpieza facial San Juan del Río" no sabe si llegó al lugar correcto en 5 segundos.

Alternativas (de más comercial a más boutique):

**Opción A — Funcional directa:**
> **Cosmetología que se siente como tu pausa favorita.**
> Faciales, depilación y rituales en San Juan del Río — con café incluido.
> [Agendar cita →] [Ver servicios]

**Opción B — Boutique + claridad:**
> **Tu cita facial, sin ansiedad.**
> Faciales, masaje, depilación y café en un solo lugar. San Juan del Río.
> [Agendar →] [Ver rituales]

**Opción C — Mantener el alma actual + claridad mínima:**
> **Venus · Cosmetología en San Juan del Río**
> Un espacio para volver a ti: piel, calma y café.
> [Agendar cita →] [Conocer servicios]

Cualquiera de las tres responde *qué + dónde + propuesta* en 2 segundos. Recomiendo **Opción A** para máxima conversión, **Opción C** si la prioridad es preservar el tono actual.

## 6. Estructura propuesta (5–6 secciones)

```
Navbar:  Rituales · Experiencia · Lealtad · Ubicación · Mi tarjeta · [Agendar]

1. HERO                  qué + dónde + 2 CTAs (Agendar / Servicios)
2. SERVICIOS             tarjetas con foto + precio + duración (con #rituales actual)
                         · ← #primera-visita compacta como sub-bloque ("qué esperar tu primera vez")
3. EXPERIENCIA + CAFÉ    una sola sección con 3 tarjetas: Estudio · Café · Comunidad
                         (refunde #filosofia + #experiencia + #comunidad + café propio)
4. RESEÑAS               3 quotes reales con nombre + link a Google Maps
5. LEALTAD               la membresía como una sola historia + las tabs "Crear / Ya tengo tarjeta"
                         (refunde #membresia + #lealtad)
6. UBICACIÓN             mapa + dirección + horario + WhatsApp
```

Footer compacto: redes + créditos + link a admin.

## 7. Métricas de éxito

| Métrica | Hoy (estimado) | Meta tras refactor |
|---|---|---|
| Palabras en body | 8,079 | ~3,000 |
| Secciones | 14 | 6 |
| % secciones con CTA accionable | 36% (5/14) | ≥80% (5/6) |
| Tiempo a entender "qué es Venus" desde Hero | 3 scrolls | < 5 segundos (visible above fold) |
| Click-through Hero → /agendar.html | (medir antes) | +30% relativo |
| Crear tarjeta de lealtad | (medir antes) | +20% relativo |
| Visitas a sección Café | nueva | medible como objetivo |

**Instrumentación recomendada:** evento simple de scroll-depth y click-en-CTAs (Plausible/Umami/GTM) para medir el antes/después del refactor.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Perder el "alma boutique" al simplificar | Mantener tipografías (Prata + Manrope), paleta crema+olivo, y reutilizar las MEJORES frases de filosofía/experiencia/comunidad dentro de la nueva sección unificada. No es un downgrade visual, es una destilación. |
| Cortar #membresia molesta si era una feature planeada | #membresia actualmente NO tiene niveles/precios/beneficios concretos — es prosa. Cortarla no quita funcionalidad real; la funcionalidad real está en #lealtad. |
| Cortar #tienda molesta si planean lanzarla pronto | Si Venus va a vender online en <30 días, reemplazar #tienda placeholder por la tienda real. Si no, removerla (lo etiquetan ellos mismos como "futura"). |
| El hero nuevo "rompe" la voz de marca | Probar 1–2 semanas con A/B mental (preguntar a 5 clientas qué entendieron al ver el hero en 5 segundos). |

## 9. Próximos pasos

1. **Decidir el hero** (opción A / B / C, o variación). Es la decisión más importante.
2. **Confirmar cortes** (#tienda, #agenda, fusión filosofía+experiencia+comunidad, fusión membresia→lealtad).
3. **Conseguir 3 quotes reales** de clientas frecuentes con permiso de usar nombre.
4. **Definir contenido del bloque Café** (foto, horario, 3–4 frases, "pasa sin cita").
5. **Implementación** (otra sesión): edición del HTML + ajustes de CSS. Estimado: 1 sesión de 60–90 min. Puede entrar como spec → plan → ejecución vía superpowers, igual que el unify de agendar.

---

**Resumen ejecutivo en una línea:** Tu landing intenta hacer 8 cosas y termina haciendo ninguna bien. Cortando 6 secciones y reescribiendo el hero, pasas de un ensayo de 8,000 palabras a una landing boutique de 6 bloques que **dice qué eres en 5 segundos** y guía a las 3 acciones que importan: agendar, café, lealtad.
