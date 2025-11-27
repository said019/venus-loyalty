# Migración de Emojis a Lucide Icons - Venus Lealtad

## ✅ Ya implementado:
1. CDN de Lucide agregado en el `<head>`
2. CSS para iconos agregado

## 📝 Cambios a realizar en admin.html:

### 1. Agregar al final del `</body>`:
```html
<script>
  lucide.createIcons();
</script>
</body>
```

### 2. Navegación principal (buscar `<nav class="nav">`):

**ANTES:**
```html
<a href="#overview">Resumen</a>
<a href="#cards">Tarjetas</a>
<a href="#events">Gift Cards</a>
<a href="#notifications">Notificaciones</a>
<a href="#appointments">Citas</a>
<a href="#services">Servicios</a>
<a href="#settings">Configuración</a>
```

**DESPUÉS:**
```html
<a href="#overview"><i data-lucide="layout-dashboard"></i> Resumen</a>
<a href="#cards"><i data-lucide="credit-card"></i> Tarjetas</a>
<a href="#events"><i data-lucide="gift"></i> Gift Cards</a>
<a href="#notifications"><i data-lucide="bell"></i> Notificaciones</a>
<a href="#appointments"><i data-lucide="calendar"></i> Citas</a>
<a href="#services"><i data-lucide="sparkles"></i> Servicios</a>
<a href="#settings"><i data-lucide="settings"></i> Configuración</a>
```

### 3. Botones principales (buscar y reemplazar):

| Buscar | Reemplazar con |
|--------|----------------|
| `➕ Nueva Cita` | `<i data-lucide="plus"></i> Nueva Cita` |
| `➕ Nuevo Servicio` | `<i data-lucide="plus"></i> Nuevo Servicio` |
| `➕ Nuevo Producto` | `<i data-lucide="plus"></i> Nuevo Producto` |
| `⬇ Reporte` | `<i data-lucide="download"></i> Reporte` |
| `🔄 Actualizar` | `<i data-lucide="refresh-cw"></i> Actualizar` |
| `🔍 Buscar` | `<i data-lucide="search"></i> Buscar` |
| `💾 Guardar` | `<i data-lucide="save"></i> Guardar` |
| `✕` (en botones cerrar) | `<i data-lucide="x"></i>` |

### 4. Botones de acciones en tablas:

**Tabla de tarjetas:**
```html
<!-- ANTES -->
<button data-action="stamp">⭐+1</button>
<button data-action="view">Ver</button>

<!-- DESPUÉS -->
<button data-action="stamp"><i data-lucide="star"></i>+1</button>
<button data-action="view"><i data-lucide="eye"></i> Ver</button>
```

**Modal de cliente:**
```html
<!-- ANTES -->
<button id="cm-stamp">⭐ +1 sello</button>
<button id="cm-whatsapp">💬 WhatsApp</button>
<button id="cm-schedule">📅 Agendar</button>
<button id="cm-redeem">🎁 Canjear</button>

<!-- DESPUÉS -->
<button id="cm-stamp"><i data-lucide="star"></i> +1 sello</button>
<button id="cm-whatsapp"><i data-lucide="message-circle"></i> WhatsApp</button>
<button id="cm-schedule"><i data-lucide="calendar"></i> Agendar</button>
<button id="cm-redeem"><i data-lucide="gift"></i> Canjear</button>
```

### 5. Tabs de Servicios/Productos:

```html
<!-- ANTES -->
<button class="tab-btn" id="btn-tab-services">
  💆 Servicios
  <span class="tab-count">0</span>
</button>
<button class="tab-btn" id="btn-tab-products">
  🛍️ Productos
  <span class="tab-count">0</span>
</button>

<!-- DESPUÉS -->
<button class="tab-btn" id="btn-tab-services">
  <i data-lucide="sparkles"></i> Servicios
  <span class="tab-count">0</span>
</button>
<button class="tab-btn" id="btn-tab-products">
  <i data-lucide="shopping-bag"></i> Productos
  <span class="tab-count">0</span>
</button>
```

### 6. Iconos de categoría de productos (en JavaScript):

**ANTES:**
```javascript
const categoryIcons = {
  'skincare': '🧴',
  'maquillaje': '💄',
  'corporal': '✨',
  'cabello': '💇',
  'otro': '📦'
};
const icon = categoryIcons[p.category] || '📦';
```

**DESPUÉS:**
```javascript
function getCategoryIcon(category) {
  const icons = {
    'skincare': 'droplet',
    'maquillaje': 'palette',
    'corporal': 'sparkle',
    'cabello': 'scissors',
    'otro': 'package'
  };
  return `<i data-lucide="${icons[category] || 'package'}"></i>`;
}
const icon = getCategoryIcon(p.category);
```

### 7. Después de cada actualización dinámica de HTML:

```javascript
// Después de innerHTML = ...
lucide.createIcons();
```

## 🎯 Prioridad de migración:

1. **Alta prioridad** (más visibles):
   - Navegación principal
   - Botones de acción principales
   - Modal de cliente
   - Tabs de servicios/productos

2. **Media prioridad**:
   - Botones en tablas
   - Iconos de estado
   - Stats cards

3. **Baja prioridad**:
   - Iconos decorativos
   - Tooltips
   - Mensajes de error/éxito

## 💡 Tip:
Puedes hacer la migración gradualmente. Los emojis y los iconos Lucide pueden coexistir sin problemas.
