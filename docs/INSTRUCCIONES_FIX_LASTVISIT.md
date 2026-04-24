# 🔧 Instrucciones: Corregir Campo "Última Visita"

## 📋 Resumen

Se agregó un endpoint en el servidor para corregir automáticamente el campo `lastVisit` en todas las tarjetas que no lo tienen.

## 🎯 Método Recomendado: Desde la Consola del Navegador

### Paso 1: Abrir el Dashboard

1. Abre tu navegador
2. Ve a: http://localhost:3000/admin
3. Inicia sesión si es necesario

### Paso 2: Abrir la Consola

1. Presiona **F12** (o clic derecho → Inspeccionar)
2. Ve a la pestaña **Console**

### Paso 3: Ejecutar el Script

Copia y pega este código en la consola:

```javascript
fetch('/api/admin/fix-lastvisit', {
    method: 'POST',
    credentials: 'include'
})
.then(res => res.json())
.then(data => {
    console.log('\n📊 Resultado:');
    console.log('   Total de tarjetas:', data.total);
    console.log('   Ya tenían lastVisit:', data.alreadyHave);
    console.log('   Corregidas:', data.fixed);
    console.log('   Sin fecha:', data.noDate);
    
    if (data.fixed > 0) {
        console.log('\n✅ Se actualizaron', data.fixed, 'tarjetas');
        console.log('💡 Refresca la página (Ctrl+F5) para ver los cambios');
    } else {
        console.log('\n✅ Todas las tarjetas ya tienen el campo lastVisit');
    }
})
.catch(err => console.error('❌ Error:', err));
```

### Paso 4: Ver el Resultado

Deberías ver algo como:

```
📊 Resultado:
   Total de tarjetas: 25
   Ya tenían lastVisit: 5
   Corregidas: 20
   Sin fecha: 0

✅ Se actualizaron 20 tarjetas
💡 Refresca la página (Ctrl+F5) para ver los cambios
```

### Paso 5: Refrescar el Dashboard

1. Presiona **Ctrl+F5** (o Cmd+Shift+R en Mac)
2. Ve a la sección "Clientes"
3. Verifica que la columna "Última Visita" ahora muestre fechas

---

## 🔄 Método Alternativo: Usando PowerShell/CMD

Si prefieres usar la línea de comandos:

### Windows (PowerShell)

```powershell
# Necesitas tener una sesión activa en el navegador
# Este método requiere copiar la cookie de sesión

# 1. Abre el dashboard en el navegador
# 2. Abre DevTools (F12) → Application → Cookies
# 3. Copia el valor de la cookie 'admin_token'
# 4. Ejecuta:

$cookie = "TU_COOKIE_AQUI"
Invoke-WebRequest -Uri "http://localhost:3000/api/admin/fix-lastvisit" `
  -Method POST `
  -Headers @{"Cookie"="admin_token=$cookie"}
```

### Linux/Mac (curl)

```bash
# 1. Obtén la cookie como se explicó arriba
# 2. Ejecuta:

curl -X POST http://localhost:3000/api/admin/fix-lastvisit \
  -H "Cookie: admin_token=TU_COOKIE_AQUI"
```

---

## 📊 ¿Qué Hace el Script?

El endpoint `/api/admin/fix-lastvisit`:

1. ✅ Busca todas las tarjetas en Firestore
2. ✅ Identifica cuáles NO tienen el campo `lastVisit`
3. ✅ Para cada una, asigna el valor de `updatedAt` o `createdAt`
4. ✅ Actualiza la tarjeta en Firestore
5. ✅ Devuelve un resumen de las operaciones

**Es seguro ejecutarlo múltiples veces** - no duplica datos ni sobrescribe valores existentes.

---

## ✅ Verificación

Después de ejecutar el script:

### En el Dashboard

1. Ve a la sección "Clientes"
2. Verifica la columna "Última Visita"
3. Deberías ver fechas en lugar de "—"

**Formatos esperados:**
- "Hoy" - Si fue hoy
- "Ayer" - Si fue ayer
- "Hace 3 días" - Si fue hace menos de 7 días
- "24 nov" - Si fue hace más tiempo

### En Firestore Console

1. Abre Firebase Console
2. Ve a Firestore Database
3. Colección "cards"
4. Verifica que cada documento tenga el campo `lastVisit`

---

## 🐛 Troubleshooting

### Error: "401 Unauthorized"

**Causa:** No estás autenticado como admin

**Solución:**
1. Asegúrate de estar en el dashboard (http://localhost:3000/admin)
2. Inicia sesión si es necesario
3. Ejecuta el script desde la consola del navegador (no desde terminal)

### Error: "Cannot find module"

**Causa:** Intentaste ejecutar `fix-lastvisit-field.js` directamente

**Solución:**
- Usa el método de la consola del navegador (recomendado)
- O usa el endpoint desde el navegador

### No se ven los cambios

**Causa:** Caché del navegador

**Solución:**
1. Presiona **Ctrl+F5** (forzar recarga)
2. O cierra y abre el navegador
3. O limpia la caché del navegador

### Aún aparece "—" en algunas tarjetas

**Causa:** Esas tarjetas realmente no tienen fecha

**Solución:**
1. Verifica en Firestore Console
2. Si no tienen `createdAt` ni `updatedAt`, agrégalas manualmente
3. O espera a que el cliente reciba un sello (se actualizará automáticamente)

---

## 📝 Logs del Servidor

Cuando ejecutes el script, verás en los logs del servidor:

```
🔧 Iniciando corrección de campo lastVisit...
✅ Juan Pérez: lastVisit = 2024-11-29T10:30:00.000Z
✅ María García: lastVisit = 2024-11-28T15:45:00.000Z
✅ Carlos López: lastVisit = 2024-11-27T09:15:00.000Z
...
📊 Resumen: {
  success: true,
  total: 25,
  alreadyHave: 5,
  fixed: 20,
  noDate: 0
}
```

---

## 🎯 Próximos Pasos

Después de corregir las tarjetas existentes:

1. ✅ El campo `lastVisit` se actualizará automáticamente cada vez que se dé un sello
2. ✅ Las nuevas tarjetas tendrán el campo desde el inicio
3. ✅ El dashboard mostrará las fechas correctamente

---

## 📞 Notas Adicionales

- El script es **idempotente** (puedes ejecutarlo múltiples veces sin problemas)
- Solo actualiza tarjetas que **NO** tienen el campo `lastVisit`
- Usa `updatedAt` como primera opción, `createdAt` como fallback
- No afecta tarjetas que ya tienen el campo
- Es seguro y no elimina datos

---

## 🚀 Resumen Rápido

```
1. Abre http://localhost:3000/admin
2. Presiona F12
3. Pega el código en la consola
4. Presiona Enter
5. Espera el resultado
6. Refresca con Ctrl+F5
7. ¡Listo! 🎉
```
