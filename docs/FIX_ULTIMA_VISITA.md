# 🔧 Corrección: Campo "Última Visita" en Dashboard

## 🎯 Problema

En la lista de clientes del dashboard, la columna "Última Visita" mostraba "—" (guión) en lugar de la fecha real, aunque al abrir el detalle del cliente sí aparecía la fecha correcta.

## 🔍 Causa

El problema tenía dos causas:

1. **Inconsistencia en nombres de campos**: El código buscaba `card.last_visit` y `card.updated_at` (con guión bajo), pero Firestore guarda los campos como `lastVisit` y `updatedAt` (camelCase).

2. **Tarjetas antiguas sin campo**: Las tarjetas creadas antes de implementar el campo `lastVisit` no tenían este campo, por lo que no se mostraba ninguna fecha.

## ✅ Solución Implementada

### 1. Actualización del Frontend (`public/admin.html`)

Se modificó el código para buscar el campo en múltiples formatos:

**Antes:**
```javascript
const lastVisitField = card.lastVisit || card.last_visit;

if (lastVisitField) {
  // formatear fecha
} else if (card.updated_at) {
  // usar updated_at como fallback
}
```

**Ahora:**
```javascript
const lastVisitField = card.lastVisit || card.last_visit || card.updatedAt || card.updated_at;

if (lastVisitField) {
  // formatear fecha (sin necesidad de else)
}
```

### 2. Cambios Aplicados

Se actualizaron **5 ubicaciones** en el código donde se usa el campo `lastVisit`:

1. ✅ **Lista de clientes** (línea ~6267)
2. ✅ **Cálculo de clientes activos** (línea ~5774)
3. ✅ **Promedio de días desde última visita** (línea ~5784)
4. ✅ **Gráfico de días de la semana** (línea ~5829)
5. ✅ **Gráfico de horas del día** (línea ~5876)

### 3. Script de Corrección

Se creó un script para actualizar tarjetas existentes que no tienen el campo `lastVisit`:

```bash
node fix-lastvisit-field.js
```

Este script:
- Busca todas las tarjetas sin campo `lastVisit`
- Les asigna el valor de `updatedAt` o `createdAt` como fallback
- Muestra un resumen de las tarjetas actualizadas

## 📋 Cómo Verificar la Corrección

### Opción 1: Verificar en el Dashboard

1. Abre el dashboard: http://localhost:3000/admin
2. Ve a la sección "Clientes"
3. Verifica que la columna "Última Visita" muestre fechas en lugar de "—"

### Opción 2: Ejecutar el Script de Corrección

```bash
node fix-lastvisit-field.js
```

**Salida esperada:**
```
🔍 Verificando tarjetas sin campo lastVisit...

📊 Total de tarjetas: 25

✅ Juan Pérez: lastVisit = 2024-11-29T10:30:00.000Z
✅ María García: lastVisit = 2024-11-28T15:45:00.000Z
✅ Carlos López: lastVisit = 2024-11-27T09:15:00.000Z
...

📊 Resumen:
   Total: 25
   Ya tenían lastVisit: 5
   Corregidas: 20
   Sin fecha: 0

✅ Se actualizaron 20 tarjetas
💡 Refresca el dashboard para ver los cambios
```

### Opción 3: Verificar Manualmente en Firestore

1. Abre Firebase Console
2. Ve a Firestore Database
3. Colección "cards"
4. Verifica que cada documento tenga el campo `lastVisit`

## 🎨 Formato de Fechas

El campo "Última Visita" ahora muestra:

- **"Hoy"** - Si fue hoy
- **"Ayer"** - Si fue ayer
- **"Hace X días"** - Si fue hace menos de 7 días
- **"13 oct"** - Si fue hace más de 7 días (formato corto)

**Ejemplos:**
```
Hoy
Ayer
Hace 3 días
24 nov
13 oct
```

## 🔄 Flujo de Actualización

### Cuando se da un sello:

```
Cliente recibe sello
    ↓
fsUpdateCardStamps() actualiza:
  - stamps: +1
  - lastVisit: fecha actual ✅
    ↓
Dashboard muestra fecha actualizada
```

### Para tarjetas existentes:

```
Tarjeta sin lastVisit
    ↓
Script fix-lastvisit-field.js
    ↓
Asigna updatedAt o createdAt
    ↓
Dashboard muestra fecha
```

## 📁 Archivos Modificados

```
public/admin.html
  - Línea ~6267: Lista de clientes
  - Línea ~5774: Clientes activos
  - Línea ~5784: Promedio última visita
  - Línea ~5829: Gráfico días semana
  - Línea ~5876: Gráfico horas día
```

## 📁 Archivos Creados

```
fix-lastvisit-field.js
  - Script para corregir tarjetas existentes
  
FIX_ULTIMA_VISITA.md
  - Esta documentación
```

## ✅ Checklist de Verificación

Después de aplicar la corrección:

- [ ] Ejecutar `node fix-lastvisit-field.js`
- [ ] Refrescar el dashboard
- [ ] Verificar que la columna "Última Visita" muestre fechas
- [ ] Dar un sello a un cliente
- [ ] Verificar que la fecha se actualice a "Hoy"
- [ ] Verificar que el formato sea correcto

## 🐛 Troubleshooting

### Problema: Aún aparece "—" en algunas tarjetas

**Solución:**
```bash
# 1. Ejecutar el script de corrección
node fix-lastvisit-field.js

# 2. Refrescar el dashboard (Ctrl+F5)

# 3. Si persiste, verificar en Firestore Console
```

### Problema: El script no encuentra tarjetas

**Causa:** Firebase no está configurado correctamente

**Solución:**
```bash
# Verificar que existe .env con:
GOOGLE_SERVICE_ACCOUNT_KEY=...

# Verificar que lib/firebase.js está inicializado
```

### Problema: Fechas incorrectas

**Causa:** Timezone o formato de fecha incorrecto

**Solución:**
El código usa `toLocaleDateString('es-MX')` que formatea en español de México. Si necesitas otro formato, modifica en `public/admin.html` línea ~6277.

## 📊 Impacto

### Antes
```
Cliente          Teléfono      Última Visita    Sellos
Juan Pérez       4421234567    —                3/8
María García     4427654321    —                5/8
Carlos López     4423456789    —                1/8
```

### Ahora
```
Cliente          Teléfono      Última Visita    Sellos
Juan Pérez       4421234567    Hoy              3/8
María García     4427654321    Ayer             5/8
Carlos López     4423456789    Hace 3 días      1/8
```

## 🎯 Beneficios

✅ **Visibilidad mejorada**: Ahora puedes ver cuándo fue la última visita de cada cliente
✅ **Mejor seguimiento**: Identifica clientes inactivos fácilmente
✅ **Datos consistentes**: Todas las tarjetas tienen el campo lastVisit
✅ **Formato amigable**: Fechas en español con formato relativo

## 🚀 Próximas Mejoras (Opcional)

- [ ] Agregar filtro por "Última visita" (últimos 7 días, 30 días, etc.)
- [ ] Ordenar por última visita
- [ ] Alertas para clientes inactivos (más de 30 días sin visita)
- [ ] Gráfico de tendencia de visitas

## 📞 Notas Adicionales

- El campo `lastVisit` se actualiza automáticamente cada vez que se da un sello
- El formato de fecha es relativo para fechas recientes (Hoy, Ayer, Hace X días)
- Para fechas antiguas se muestra el formato corto (día + mes)
- El script de corrección es seguro de ejecutar múltiples veces (no duplica datos)
