# 📋 Sistema de Expedientes de Clientas

## Descripción

Sistema completo para gestionar expedientes médicos/estéticos de las clientas, incluyendo:

- **Datos personales**: Edad, tipo de piel, alergias, antecedentes médicos, objetivos
- **Sesiones de tratamiento**: Historial de cada sesión con parámetros de aparatos
- **Galería de fotos**: Fotos de seguimiento (antes/después/progreso)
- **Comparación**: Vista antes/después por zona del cuerpo

## Configuración Requerida

### 1. Variables de Entorno para Cloudinary

Las fotos se almacenan en Cloudinary. Necesitas crear una cuenta gratuita en [cloudinary.com](https://cloudinary.com) y agregar estas variables en Render:

```env
CLOUDINARY_CLOUD_NAME=tu-cloud-name
CLOUDINARY_API_KEY=tu-api-key
CLOUDINARY_API_SECRET=tu-api-secret
```

### 2. Pasos para configurar Cloudinary:

1. Ve a [cloudinary.com](https://cloudinary.com) y crea una cuenta gratuita
2. En el Dashboard, copia tus credenciales:
   - Cloud Name
   - API Key
   - API Secret
3. En Render → Dashboard → tu app → Environment:
   - Agrega las 3 variables con los valores copiados
4. Haz redeploy de la app

## Uso del Sistema

### Acceder al Expediente

1. Desde el panel de Tarjetas, haz clic en una clienta
2. En el modal de la clienta, haz clic en **"📋 Expediente"**
3. Se abre el modal del expediente con 4 pestañas

### Pestañas del Expediente

#### 👤 Datos
- Edad
- Tipo de piel (normal, grasa, seca, mixta, sensible)
- Alergias conocidas
- Antecedentes médicos
- Objetivos del tratamiento
- Observaciones generales

#### 💆 Sesiones
Lista de todas las sesiones de tratamiento con:
- Fecha y tipo de tratamiento
- Aparato utilizado y parámetros (potencia, frecuencia, tiempo)
- Zonas tratadas
- Productos utilizados
- Observaciones y resultados
- Recomendaciones para próxima sesión

#### 📸 Fotos
Galería de fotos con filtros por:
- Tipo: Antes, Después, Progreso
- Categoría: Facial, Corporal, Depilación

Al subir fotos se pregunta:
- Tipo de foto (antes/después/progreso)
- Categoría
- Área del cuerpo (para comparaciones)

#### 🔄 Comparar
Vista lado a lado de fotos "antes" y "después" de la misma zona.

## API Endpoints

### Expedientes
- `GET /api/client-records/card/:cardId` - Obtener/crear expediente
- `PUT /api/client-records/:recordId` - Actualizar datos del expediente

### Sesiones
- `POST /api/client-records/:recordId/sessions` - Nueva sesión
- `PUT /api/client-records/sessions/:sessionId` - Actualizar sesión
- `DELETE /api/client-records/sessions/:sessionId` - Eliminar sesión

### Fotos
- `POST /api/client-records/:recordId/photos` - Subir una foto
- `POST /api/client-records/:recordId/photos/bulk` - Subir múltiples fotos
- `DELETE /api/client-records/photos/:photoId` - Eliminar foto
- `GET /api/client-records/:recordId/compare` - Obtener fotos para comparación

## Base de Datos

### Tablas creadas

```sql
client_records
├── id
├── cardId (FK → cards)
├── age
├── skinType
├── allergies
├── medicalHistory
├── objectives
├── observations
├── createdAt
└── updatedAt

treatment_sessions
├── id
├── recordId (FK → client_records)
├── date
├── treatmentType
├── serviceName
├── staffName
├── deviceName
├── deviceSettings (JSON: {power, frequency, time})
├── treatedAreas
├── productsUsed
├── observations
├── results
├── recommendations
├── createdAt
└── updatedAt

client_photos
├── id
├── recordId (FK → client_records)
├── sessionId (FK → treatment_sessions, nullable)
├── url (Cloudinary URL)
├── publicId (Cloudinary public ID)
├── type (before/after/progress)
├── category (facial/corporal/depilacion)
├── area
├── description
├── takenAt
├── createdAt
└── updatedAt
```

## Notas Técnicas

- Las fotos se redimensionan automáticamente a max 1200x1200px
- Formato optimizado automáticamente por Cloudinary
- Las fotos se eliminan de Cloudinary cuando se borran del expediente
- El expediente se crea automáticamente la primera vez que se accede

## Límites

- **Cloudinary Free**: 25 créditos/mes (~25GB storage, ~25GB bandwidth)
- **Tamaño máximo por foto**: 10MB
- **Formatos aceptados**: Solo imágenes (jpg, png, webp, etc.)
