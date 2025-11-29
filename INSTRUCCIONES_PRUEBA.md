# 🧪 Instrucciones de Prueba - Cancelación por WhatsApp

## 🎯 Objetivo

Verificar que cuando un cliente cancela por WhatsApp:
1. ✅ La cita se cancela en Firestore
2. ✅ El evento se elimina de ambos calendarios de Google
3. ✅ Se crea una notificación en el dashboard
4. ✅ El dashboard se actualiza automáticamente

---

## 📋 Pre-requisitos

Antes de probar, asegúrate de tener:

- [x] Servidor corriendo (`npm start` o `node server.js`)
- [x] Credenciales de Google Calendar configuradas
- [x] Twilio configurado (para pruebas reales de WhatsApp)
- [x] Al menos una cita creada en el sistema

---

## 🧪 Método 1: Prueba con Script (Recomendado)

Este método simula una cancelación sin necesidad de enviar WhatsApp real.

### Paso 1: Obtener ID de una cita

```bash
# Opción A: Desde el dashboard
1. Abre http://localhost:3000/admin
2. Ve al tab "Citas"
3. Inspecciona el botón "Cancelar" de cualquier cita
4. Copia el ID que aparece en: onclick="cancelAppointment('ID_AQUI')"

# Opción B: Desde Firestore Console
1. Abre Firebase Console
2. Ve a Firestore Database
3. Colección "appointments"
4. Copia el Document ID de cualquier cita con status "scheduled" o "confirmed"
```

### Paso 2: Ejecutar el script de prueba

```bash
node test-cancelacion-whatsapp.js <ID_DE_LA_CITA>
```

**Ejemplo:**
```bash
node test-cancelacion-whatsapp.js abc123xyz456
```

### Paso 3: Verificar resultados

El script mostrará:
```
🔍 Buscando cita: abc123xyz456

📋 Datos de la cita:
   Cliente: Juan Pérez
   Teléfono: 524421234567
   Servicio: Limpieza Facial
   Fecha: 2024-11-30T10:00:00-06:00
   Status actual: scheduled
   Calendar Event 1: event_id_1
   Calendar Event 2: event_id_2

❌ Simulando cancelación por WhatsApp...

1️⃣  Cancelando en Firestore...
   ✅ Cancelada en Firestore

2️⃣  Eliminando de Google Calendar...
   ✅ Evento eliminado del calendar 1: event_id_1
   ✅ Evento eliminado del calendar 2: event_id_2

3️⃣  Creando notificación...
   ✅ Notificación creada

4️⃣  Enviando confirmación por WhatsApp...
   ⏭️  Saltado (descomenta para enviar realmente)

✅ ¡Cancelación completada exitosamente!

📊 Verifica en:
   1. Dashboard → Tab "Citas" (se actualizará en 30 seg)
   2. Google Calendar (Said y Alondra)
   3. Dashboard → Notificaciones
```

### Paso 4: Verificar en el dashboard

1. Abre el dashboard: http://localhost:3000/admin
2. Ve al tab "Citas"
3. Espera máximo 30 segundos
4. La cita debe aparecer como "Cancelada" (rojo)
5. Verifica que desapareció del calendario semanal

### Paso 5: Verificar en Google Calendar

1. Abre Google Calendar de Said (saidromero19@gmail.com)
2. Verifica que el evento ya no existe
3. Abre Google Calendar de Alondra (alondraosornom@gmail.com)
4. Verifica que el evento ya no existe

---

## 🧪 Método 2: Prueba Real con WhatsApp

Este método prueba el flujo completo incluyendo el webhook de Twilio.

### Paso 1: Crear una cita de prueba

```bash
# Desde el dashboard
1. Abre http://localhost:3000/admin
2. Ve al tab "Citas"
3. Click en "Nueva Cita"
4. Llena los datos:
   - Cliente: Tu nombre
   - Teléfono: Tu número de WhatsApp (con código de país)
   - Servicio: Cualquiera
   - Fecha: Mañana
   - Hora: Cualquiera
5. ✅ Marca "Enviar confirmación por WhatsApp"
6. Click en "Crear Cita"
```

### Paso 2: Recibir mensaje de confirmación

Deberías recibir un mensaje de WhatsApp como:

```
¡Hola [Tu Nombre]! 👋

Tu cita ha sido confirmada:

📅 Servicio: [Servicio]
📆 Fecha: [Fecha]
🕐 Hora: [Hora]
📍 Lugar: Cactus 50, San Juan del Río

Para confirmar, responde:
1️⃣ Confirmo
2️⃣ Reprogramar
3️⃣ Cancelar
```

### Paso 3: Cancelar por WhatsApp

Responde al mensaje con cualquiera de estas opciones:
- `Cancelar`
- `3`
- `cancelar`

### Paso 4: Verificar respuesta

Deberías recibir:
```
❌ Tu cita ha sido cancelada exitosamente. Esperamos verte pronto de nuevo.
```

### Paso 5: Verificar en el sistema

1. **Dashboard** (espera 30 seg o refresca):
   - La cita aparece como "Cancelada"
   - Hay una notificación nueva

2. **Google Calendar**:
   - El evento desapareció de ambos calendarios

3. **Logs del servidor**:
```
📩 Mensaje recibido de 524421234567: Cancelar
❌ Procesando cancelación para cita abc123
✅ Evento eliminado del calendar 1: event_id_1
✅ Evento eliminado del calendar 2: event_id_2
❌ Cita abc123 cancelada exitosamente (Firestore + Google Calendar)
```

---

## 🧪 Método 3: Simular Webhook (Sin WhatsApp Real)

Este método simula el webhook de Twilio sin necesidad de enviar WhatsApp.

### Paso 1: Obtener datos de una cita

```bash
# Necesitas:
- ID de la cita
- Teléfono del cliente (formato: 524421234567)
```

### Paso 2: Simular webhook con curl

```bash
# Windows (PowerShell)
Invoke-WebRequest -Uri "http://localhost:3000/api/whatsapp/webhook" `
  -Method POST `
  -ContentType "application/x-www-form-urlencoded" `
  -Body "From=whatsapp:+524421234567&Body=Cancelar"

# Linux/Mac
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp:+524421234567" \
  -d "Body=Cancelar"
```

### Paso 3: Verificar logs del servidor

Deberías ver:
```
📥 Webhook recibido: { From: 'whatsapp:+524421234567', Body: 'Cancelar' }
📩 Mensaje recibido de 524421234567: Cancelar
🔍 Buscando cita para teléfono normalizado: 524421234567
✅ Encontrado por coincidencia parcial: abc123
❌ Procesando cancelación para cita abc123
✅ Evento eliminado del calendar 1: event_id_1
✅ Evento eliminado del calendar 2: event_id_2
❌ Cita abc123 cancelada exitosamente (Firestore + Google Calendar)
```

---

## 🧪 Método 4: Verificar Auto-Refresh del Dashboard

Este método verifica que el dashboard se actualice automáticamente.

### Paso 1: Abrir dashboard

```bash
1. Abre http://localhost:3000/admin
2. Ve al tab "Citas"
3. Abre la consola del navegador (F12)
```

### Paso 2: Verificar que auto-refresh está activo

En la consola deberías ver cada 30 segundos:
```
🔄 Auto-refresh: actualizando citas...
```

### Paso 3: Cancelar una cita desde otro dispositivo

```bash
# Opción A: Desde otro navegador/dispositivo
- Abre el dashboard en otro navegador
- Cancela una cita manualmente

# Opción B: Ejecutar el script de prueba
node test-cancelacion-whatsapp.js <ID_CITA>

# Opción C: Cancelar por WhatsApp real
- Responde "Cancelar" a un mensaje de confirmación
```

### Paso 4: Observar actualización automática

En el dashboard original:
1. Espera máximo 30 segundos
2. La lista de citas se actualiza automáticamente
3. El calendario semanal se actualiza
4. Las estadísticas se actualizan
5. En la consola aparece: `🔄 Auto-refresh: actualizando citas...`

### Paso 5: Verificar que se detiene al cambiar de tab

```bash
1. Cambia a otro tab (ej: "Clientes")
2. Verifica en consola que ya no aparece el mensaje de auto-refresh
3. Regresa al tab "Citas"
4. Verifica que el auto-refresh se reinicia
```

---

## ✅ Checklist de Verificación

Después de cada prueba, verifica:

### En Firestore
- [ ] La cita tiene `status: 'cancelled'`
- [ ] Tiene `cancelledAt` con timestamp
- [ ] Tiene `cancelledVia: 'whatsapp'` (o 'whatsapp_test')

### En Google Calendar 1 (Said)
- [ ] El evento ya no existe
- [ ] No hay eventos duplicados

### En Google Calendar 2 (Alondra)
- [ ] El evento ya no existe
- [ ] No hay eventos duplicados

### En Dashboard
- [ ] La cita aparece como "Cancelada" (rojo)
- [ ] No aparece en el calendario semanal
- [ ] Las estadísticas se actualizaron
- [ ] Hay una notificación nueva
- [ ] El auto-refresh funciona (cada 30 seg)

### En Logs del Servidor
- [ ] Aparece: "Procesando cancelación para cita..."
- [ ] Aparece: "Evento eliminado del calendar 1"
- [ ] Aparece: "Evento eliminado del calendar 2"
- [ ] Aparece: "Cita cancelada exitosamente"

---

## 🐛 Troubleshooting

### Problema: "No se encontró cita activa"

**Causa:** El teléfono no coincide o la cita ya está cancelada

**Solución:**
```bash
# Verificar formato del teléfono
- Debe ser: 524421234567 (12 dígitos con código de país)
- No debe tener: +, -, espacios, paréntesis

# Verificar status de la cita
- Debe ser: 'scheduled', 'confirmed', o 'rescheduling'
- No debe ser: 'cancelled' o 'completed'
```

### Problema: "Error eliminando evento del calendar"

**Causa:** Credenciales de Google Calendar no configuradas o evento ya eliminado

**Solución:**
```bash
# Verificar credenciales
1. Revisa que exista: GOOGLE_SERVICE_ACCOUNT_KEY en .env
2. Verifica que el service account tenga acceso a los calendarios
3. Verifica que los IDs de calendario sean correctos en config.js

# Verificar que el evento existe
1. Abre Google Calendar
2. Busca el evento por fecha/hora
3. Si no existe, es normal que falle (ya fue eliminado)
```

### Problema: "Dashboard no se actualiza"

**Causa:** Auto-refresh no está activo o hay error en JavaScript

**Solución:**
```bash
# Verificar en consola del navegador
1. Abre F12 → Console
2. Busca errores en rojo
3. Verifica que aparezca: "🔄 Auto-refresh: actualizando citas..."

# Forzar actualización manual
1. Cambia a otro tab
2. Regresa al tab "Citas"
3. Esto reinicia el auto-refresh
```

### Problema: "WhatsApp no se envía"

**Causa:** Twilio no configurado o número no válido

**Solución:**
```bash
# Verificar configuración de Twilio
1. TWILIO_ACCOUNT_SID en .env
2. TWILIO_AUTH_TOKEN en .env
3. TWILIO_WHATSAPP_NUMBER en .env

# Verificar número
- Debe tener código de país: +52
- Debe estar registrado en Twilio Sandbox (para pruebas)
- Debe haber enviado "join [palabra]" al sandbox
```

---

## 📊 Resultados Esperados

### ✅ Prueba Exitosa

```
✅ Cita cancelada en Firestore
✅ Evento eliminado de Calendar 1
✅ Evento eliminado de Calendar 2
✅ Notificación creada
✅ Dashboard actualizado (30 seg)
✅ WhatsApp enviado (opcional)
```

### ❌ Prueba Fallida

Si algo falla:
1. Revisa los logs del servidor
2. Revisa la consola del navegador
3. Verifica las credenciales
4. Consulta la sección de Troubleshooting
5. Revisa RESUMEN_CAMBIOS.md para más detalles

---

## 🎓 Notas Adicionales

- El auto-refresh es cada 30 segundos (configurable)
- La eliminación del calendario es asíncrona (no bloquea)
- Si falla la eliminación del calendario, la cita igual se cancela
- El webhook busca citas por teléfono con normalización automática
- Se soportan múltiples formatos de respuesta: "Cancelar", "3", "cancelar"

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs del servidor
2. Revisa la consola del navegador
3. Consulta RESUMEN_CAMBIOS.md
4. Consulta TEST_CANCELACION.md
