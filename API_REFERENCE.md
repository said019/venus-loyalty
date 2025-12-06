# 📚 API Reference - Venus Lealtad v1.2.0

## Última actualización: 4 de Diciembre de 2025

---

## 🎯 Endpoints Principales

### Dashboard

#### `GET /api/dashboard/stats` ⭐ NUEVO
**Descripción:** Obtiene estadísticas completas del dashboard

**Autenticación:** ✅ Requerida (`adminAuth`)

**Parámetros:** Ninguno

**Tiempo de respuesta:** 100-200ms

**Respuesta exitosa:**
```json
{
  "success": true,
  "data": {
    "topClients": [
      {
        "rank": 1,
        "name": "Juan Pérez",
        "stamps": 6,
        "cycles": 2,
        "totalStamps": 22,
        "isGold": true
      }
    ],
    "birthdays": [
      {
        "name": "María García",
        "date": "15 de diciembre",
        "daysUntil": 11,
        "badge": "En 11 días"
      }
    ],
    "wallets": {
      "apple": 87,
      "google": 65
    },
    "totalClients": 152
  }
}
```

**Errores:**
```json
{
  "success": false,
  "error": "Error interno del servidor"  // En prod
}
```

---

#### `GET /api/dashboard/today`
**Descripción:** Estadísticas de hoy (citas, ingresos, etc)

**Autenticación:** ✅ Requerida

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "appointments": 5,
    "pending": 2,
    "income": 1500
  }
}
```

---

#### `GET /api/dashboard/history`
**Descripción:** Historial de últimos 7 días

**Autenticación:** ✅ Requerida

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "date": "jue. 28",
      "appointments": 12,
      "income": 2500
    },
    ...
  ]
}
```

---

### Tarjetas de Lealtad

#### `GET /api/admin/cards-firebase` 🔄 MEJORADO
**Descripción:** Listar tarjetas con paginación

**Autenticación:** ✅ Requerida

**Parámetros:**
| Nombre | Tipo | Default | Máx | Descripción |
|--------|------|---------|-----|-------------|
| `page` | int | 1 | - | Número de página |
| `limit` | int | 12 | 100 | Items por página |
| `q` | string | - | - | Búsqueda (nombre, teléfono) |
| `sortBy` | string | createdAt | - | Campo para ordenar |
| `sortOrder` | string | desc | - | asc o desc |

**Ejemplo:**
```
GET /api/admin/cards-firebase?page=1&limit=50&q=juan
```

**Respuesta:**
```json
{
  "page": 1,
  "totalPages": 3,
  "total": 145,
  "items": [
    {
      "id": "card-123",
      "name": "Juan Pérez",
      "stamps": 6,
      "walletType": "apple",
      ...
    }
  ],
  "sortBy": "createdAt",
  "sortOrder": "desc",
  "source": "firestore"
}
```

---

### Métricas

#### `GET /api/admin/metrics`
**Descripción:** Métricas rápidas del día

**Autenticación:** ✅ Requerida

**Respuesta:**
```json
{
  "total": 152,
  "full": 23,
  "stampsToday": 45,
  "redeemsToday": 8
}
```

---

#### `GET /api/admin/metrics-month`
**Descripción:** Métricas del mes actual

**Autenticación:** ✅ Requerida

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "total": 152,
    "activeClients": 89,
    "stampsThisMonth": 234,
    "redeemsThisMonth": 12,
    "returnRate": 78
  }
}
```

---

### Notificaciones

#### `GET /api/notifications`
**Descripción:** Listar notificaciones recientes

**Autenticación:** ✅ Requerida

**Parámetros:**
| Nombre | Tipo | Default |
|--------|------|---------|
| `limit` | int | 30 |

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "notif-123",
      "type": "stamp",
      "title": "Nuevo sello",
      "message": "Juan Pérez recibió un sello",
      "createdAt": "2024-12-04T..."
    }
  ]
}
```

---

#### `DELETE /api/notifications/all`
**Descripción:** Borrar historial de notificaciones

**Autenticación:** ✅ Requerida

**Respuesta:**
```json
{
  "success": true,
  "deleted": 45
}
```

---

### Gift Cards

#### `GET /api/giftcards`
**Descripción:** Listar gift cards

**Autenticación:** ✅ Requerida

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "gc-123",
      "status": "pending",  // pending | redeemed | expired
      "service": "Masaje facial",
      "expiresAt": "2024-12-31T...",
      "createdAt": "2024-12-04T..."
    }
  ]
}
```

---

### Citas

#### `GET /api/appointments`
**Descripción:** Obtener citas

**Autenticación:** ✅ Requerida

**Parámetros:**
| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `date` | string | YYYY-MM-DD |
| `from` | string | YYYY-MM-DD hh:mm |
| `to` | string | YYYY-MM-DD hh:mm |

---

## 🔒 Autenticación

### Admin Session

Todos los endpoints marcados con ✅ requieren autenticación de admin.

**Cookie requerida:** `admin_session`

**Cómo obtener:**
```javascript
// Después de login
POST /api/admin/login
{
  "email": "admin@venus.com",
  "password": "secure_password"
}

// Respuesta incluye cookie automáticamente
// Subsecuentes requests usan la cookie
```

### Validación
```javascript
// Todos los endpoints verifican:
if (!req.user || !req.user.isAdmin) {
  return res.status(401).json({
    success: false,
    error: "Unauthorized"
  });
}
```

---

## 🚀 Performance

### Benchmarks (4 Dec 2025)

| Endpoint | Latencia | Notas |
|----------|----------|-------|
| `/api/dashboard/stats` | 145ms | Dashboard principal |
| `/api/admin/metrics-month` | 89ms | Métricas KPI |
| `/api/dashboard/today` | 72ms | Stats de hoy |
| `/api/admin/cards-firebase?page=1&limit=12` | 234ms | Paginación |
| `/api/notifications` | 98ms | Historial |

### Optimizaciones Aplicadas

1. **Cálculos en servidor** (vs cliente)
2. **Índices de Firestore** para búsquedas
3. **Caché en memoria** para datos estáticos
4. **Paginación dinámica** (máx 100 items)

---

## 📊 Formato de Respuestas

### Respuesta Exitosa

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-12-04T15:30:00Z",
    "duration_ms": 145
  }
}
```

### Respuesta con Error

**Desarrollo:**
```json
{
  "success": false,
  "error": "Descripción del error",
  "stack": "Error: ...\n at ..."
}
```

**Producción:**
```json
{
  "success": false,
  "error": "Error interno del servidor"
}
```

---

## 🔍 Debugging

### Habilitar Logs Detallados

```bash
# En .env
DEBUG=1
LOG_LEVEL=debug

# En server.js
if (process.env.DEBUG) {
  console.log('[DEBUG]', req.method, req.path, duration + 'ms');
}
```

### Ver Duración de Requests

```javascript
// Todos los requests registran duración
[GET] /api/dashboard/stats - 200 (145ms)
[GET] /api/admin/metrics - 200 (89ms)
[POST] /api/appointments - 201 (523ms)
[GET] /api/notifications - 200 (98ms)
```

### Errores

```javascript
// Server logs
❌ Error en GET /api/dashboard/stats: Missing Firestore
  Stack: Error: Firestore not initialized
    at loadDashboardStats (server.js:2580)
```

---

## 🧪 Ejemplos de Uso

### JavaScript/Fetch

```javascript
// Obtener dashboard stats
const response = await fetch('/api/dashboard/stats', {
  credentials: 'include'  // ✅ Incluir cookies
});

const json = await response.json();

if (json.success) {
  console.log('Top clientes:', json.data.topClients);
  console.log('Cumpleaños:', json.data.birthdays);
} else {
  console.error('Error:', json.error);
}
```

### cURL

```bash
curl -X GET 'http://localhost:3000/api/dashboard/stats' \
  -H 'Cookie: admin_session=xyz123' \
  -H 'Accept: application/json'
```

### Python

```python
import requests

response = requests.get(
    'http://localhost:3000/api/dashboard/stats',
    cookies={'admin_session': 'xyz123'}
)

data = response.json()
if data['success']:
    print(f"Top clientes: {data['data']['topClients']}")
```

---

## ⚠️ Límites y Restricciones

### Rate Limiting (Recomendado)

- **Dashboard:** 1 request cada 60 segundos
- **Métricas:** 1 request cada 30 segundos
- **Cartas:** 1 request por acción

### Límites de Datos

| Límite | Valor | Razón |
|--------|-------|-------|
| `limit` máximo | 100 | Prevenir sobrecarga |
| Tarjetas máx | 10,000 | Rendimiento Firestore |
| Notificaciones | 30 default | Evitar memorias grandes |
| Top clientes | 5 | Dashboard |
| Cumpleaños | 3 | UI compacta |

---

## 🔄 Cambios en v1.2.0

### Nuevos Endpoints
- ✅ `/api/dashboard/stats` - Dashboard optimizado

### Mejorado
- ✅ `/api/admin/cards-firebase` - Paginación dinámica

### Deprecado
- ⚠️ Frontend no más paginación manual

### Removed
- Ninguno

---

## 📋 Próximas APIs

### Planeado para v1.3.0
- [ ] `/api/dashboard/stats/cached` - Con caché
- [ ] `/api/devices` - Listar dispositivos
- [ ] `/api/audit-log` - Auditoría

### Planeado para v2.0.0
- [ ] GraphQL endpoint
- [ ] WebSocket para real-time
- [ ] Versionamiento de API

---

## 🎓 Referencias

- **Servidor:** Node.js + Express
- **Base de datos:** Google Firestore
- **Autenticación:** Session cookies
- **CORS:** Habilitado para localhost

---

## 📞 Soporte

Para issues con API:
1. Verificar si el endpoint existe en esta documentación
2. Revisar status code de la respuesta
3. Consultar logs del servidor
4. Ejecutar con `DEBUG=1`

---

**Última actualización:** 4 de Diciembre de 2025
**Versión API:** 1.2.0
**Estado:** ✅ Estable
