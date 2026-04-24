# Configurar Ubicación del Negocio para Apple Wallet

## ¿Qué hace esto?

Cuando agregas la ubicación de tu negocio al pase de Apple Wallet, el pase aparecerá automáticamente en la **pantalla de bloqueo** del iPhone cuando la clienta esté cerca de tu negocio (dentro de 100 metros).

## Cómo obtener las coordenadas de tu negocio

### Opción 1: Google Maps (Recomendado)

1. Abre [Google Maps](https://maps.google.com)
2. Busca tu negocio o dirección
3. Haz clic derecho en el marcador
4. Selecciona "¿Qué hay aquí?"
5. En la parte inferior aparecerán las coordenadas, por ejemplo: `20.3880, -99.9960`
6. El primer número es la **latitud**, el segundo es la **longitud**

### Opción 2: Apple Maps

1. Abre Apple Maps en tu Mac o iPhone
2. Busca tu negocio
3. Haz clic en "Compartir" → "Copiar coordenadas"

## Configurar en tu proyecto

1. Abre el archivo `.env`
2. Agrega o modifica estas líneas:

```env
BUSINESS_LATITUDE=20.3880
BUSINESS_LONGITUDE=-99.9960
```

3. Reemplaza los valores con las coordenadas de tu negocio
4. Reinicia el servidor

## Ejemplo para San Juan del Río, Querétaro

```env
# Venus Cosmetología - Cactus 50, San Juan del Río
BUSINESS_LATITUDE=20.3880
BUSINESS_LONGITUDE=-99.9960
```

## Cómo funciona

- Cuando una clienta con el pase en su Apple Wallet se acerca a tu negocio (dentro de 100 metros)
- El pase aparece automáticamente en su pantalla de bloqueo
- Muestra el mensaje: "¡Estás cerca de Venus! Muestra tu tarjeta de lealtad"
- Esto le recuerda que tiene sellos acumulados y puede usarlos

## Ajustar la distancia

Si quieres cambiar la distancia de activación (por defecto 100 metros), edita el archivo `lib/apple.js`:

```javascript
maxDistance: 100, // Cambia este número (en metros)
```

## Notas importantes

- ✅ La ubicación solo se usa para mostrar el pase en pantalla de bloqueo
- ✅ NO se rastrea la ubicación de la clienta
- ✅ La clienta debe tener servicios de ubicación activados
- ✅ Funciona incluso si la app de Wallet está cerrada
- ✅ Es una función nativa de iOS, muy útil para negocios físicos

## Probar

1. Descarga el pase en tu iPhone
2. Ve a Ajustes → Wallet y Apple Pay → Activar "Sugerencias de Wallet"
3. Acércate a tu negocio
4. El pase debería aparecer en la pantalla de bloqueo

¡Listo! 🎉
