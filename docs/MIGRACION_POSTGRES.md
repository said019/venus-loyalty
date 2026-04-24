# Migración de Firebase a PostgreSQL

## Pasos para completar la migración

### 1. Crear base de datos en Render

1. Ve a [Render Dashboard](https://dashboard.render.com)
2. Click en "New" → "PostgreSQL"
3. Configura:
   - Name: `venus-db`
   - Database: `venus`
   - User: `venus_user`
   - Region: Oregon (o la más cercana)
   - Plan: Free (o el que prefieras)
4. Click "Create Database"
5. Espera a que se cree y copia la **Internal Database URL**

### 2. Configurar variable de entorno

En tu servicio de Render (venus-loyalty):

1. Ve a "Environment" → "Environment Variables"
2. Agrega:
   ```
   DATABASE_URL=postgresql://venus_user:PASSWORD@HOST:5432/venus
   ```
   (Usa la Internal Database URL que copiaste)

### 3. Crear las tablas

Desde tu máquina local con la DATABASE_URL configurada:

```bash
# Generar cliente de Prisma
npm run db:generate

# Crear tablas en la base de datos
npm run db:push
```

### 4. Migrar datos de Firebase

**IMPORTANTE**: Ejecuta esto ANTES de hacer deploy del nuevo código.

```bash
# Asegúrate de tener las credenciales de Firebase configuradas
# y la DATABASE_URL apuntando a PostgreSQL

npm run db:seed
```

Esto ejecutará el script `scripts/migrate-firebase-to-postgres.js` que:
- Lee todos los datos de Firebase
- Los inserta en PostgreSQL
- Muestra el progreso y errores

### 5. Deploy

Una vez migrados los datos:

```bash
git add -A
git commit -m "Migrate from Firebase to PostgreSQL"
git push
```

Render detectará el cambio y hará deploy automáticamente.

### 6. Verificar

1. Abre tu aplicación
2. Verifica que puedas ver:
   - Tarjetas de lealtad
   - Citas
   - Servicios
   - Productos
   - Reportes

### Comandos útiles

```bash
# Ver la base de datos en el navegador
npm run db:studio

# Regenerar cliente después de cambios en schema
npm run db:generate

# Aplicar cambios de schema a la BD
npm run db:push
```

## Estructura de archivos

```
prisma/
  schema.prisma      # Esquema de la base de datos

src/db/
  index.js           # Cliente de Prisma
  compat.js          # Capa de compatibilidad (simula Firestore)
  repositories.js    # Repositorios con funciones de BD

scripts/
  migrate-firebase-to-postgres.js  # Script de migración
```

## Rollback (si algo sale mal)

Si necesitas volver a Firebase:

1. En `server.js`, cambia:
   ```js
   // Comentar:
   // import { firestore } from './src/db/compat.js';
   
   // Descomentar:
   import { firestore } from "./lib/firebase.js";
   ```

2. Haz lo mismo en los demás archivos que fueron modificados.

## Notas

- La capa de compatibilidad (`compat.js`) simula la API de Firestore
- Esto permite una migración gradual sin reescribir todo el código
- En el futuro, puedes usar directamente los repositorios de `repositories.js` para mejor rendimiento
