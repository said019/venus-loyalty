# Runbook: Venus Skin a producción

Para Said. Cada paso que toca producción empieza con "Con autorización de Said:". Nada se ejecuta solo; si un resultado no es el esperado, detente y no sigas.

Datos fijos: remoto `origin` = `https://github.com/said019/venus-loyalty-respaldo-privado.git` (respaldo); remoto `upstream` = `https://github.com/said019/venus-loyalty.git` (Railway despliega su `main`). Railway: proyecto "Venus", servicio `venus-loyalty`, servicio de base de datos `Postgres`, dominio `https://venuscosmetologia.com.mx`. No hay release command: nada corre `prisma migrate deploy` solo.

## 1. Rebase y pruebas (local)

```bash
git fetch upstream && git rebase upstream/main
npm test
```
OK: el rebase termina sin conflictos y `npm test` sale con `fail 0`. Si hay conflictos, resuélvelos y `git rebase --continue`; si las pruebas fallan, no avances.

## 2. Respaldo de la rama

Con autorización de Said:
```bash
git push origin feat/skin-maps-history
```
OK: la rama aparece en el repo de respaldo. Si el push se rechaza tras el rebase, es esperado en una rama ya publicada; confirma con Said antes de usar `--force-with-lease`.

## 3. Migraciones (ANTES de desplegar)

Las migraciones son aditivas (una tabla nueva y dos columnas nulas), así que el código viejo sigue funcionando con ellas aplicadas.

Obtén `DATABASE_PUBLIC_URL` en Railway: servicio `Postgres` > Variables. La URL interna `postgres.railway.internal` no se alcanza desde la laptop.

Con autorización de Said:
```bash
DATABASE_URL="<DATABASE_PUBLIC_URL>" npx prisma migrate status
```
- Si dice `Database schema is up to date` o solo lista como pendientes `20261021000000_skin_layer_sets` y `20261021010000_skin_assessment_retire`: ve a 3a.
- Si dice que hay migraciones fallidas, que la base está "drifted" o lista otras migraciones distintas: ve a 3b y no uses `migrate deploy`.

### 3a. Camino normal
Con autorización de Said:
```bash
DATABASE_URL="<DATABASE_PUBLIC_URL>" npx prisma migrate deploy
```
OK: `All migrations have been successfully applied`. Repite `migrate status`: debe decir `up to date`. Si el estado ya era `up to date`, `migrate deploy` no hace nada (no-op) y no es un error.

### 3b. Camino manual
Con autorización de Said, ejecuta cada bloque con `psql "<DATABASE_PUBLIC_URL>"` (o el editor SQL de Railway, pestaña Data del servicio `Postgres`), en este orden, y después marca cada una:

`20261021000000_skin_layer_sets`:
```sql
-- CreateTable
CREATE TABLE "skin_layer_sets" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "sourcePhotoId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "notice" TEXT NOT NULL,
    "images" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skin_layer_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skin_layer_sets_sourcePhotoId_createdAt_idx" ON "skin_layer_sets"("sourcePhotoId", "createdAt");

-- CreateIndex
CREATE INDEX "skin_layer_sets_recordId_idx" ON "skin_layer_sets"("recordId");

-- AddForeignKey
ALTER TABLE "skin_layer_sets" ADD CONSTRAINT "skin_layer_sets_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "client_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skin_layer_sets" ADD CONSTRAINT "skin_layer_sets_sourcePhotoId_fkey" FOREIGN KEY ("sourcePhotoId") REFERENCES "client_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
```bash
DATABASE_URL="<DATABASE_PUBLIC_URL>" npx prisma migrate resolve --applied 20261021000000_skin_layer_sets
```

`20261021010000_skin_assessment_retire`:
```sql
-- AlterTable
ALTER TABLE "skin_advisor_assessments" ADD COLUMN     "retiredAt" TIMESTAMP(3),
ADD COLUMN     "retiredById" TEXT;

-- CreateIndex
CREATE INDEX "skin_advisor_assessments_recordId_retiredAt_idx" ON "skin_advisor_assessments"("recordId", "retiredAt");
```
```bash
DATABASE_URL="<DATABASE_PUBLIC_URL>" npx prisma migrate resolve --applied 20261021010000_skin_assessment_retire
```
OK: cada SQL responde `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE` sin error y al final `migrate status` dice `up to date`. Si un SQL falla (por ejemplo "already exists"), no marques esa migración como aplicada: revisa qué parte sí quedó y avísame.

## 4. Variables en Railway

Con autorización de Said, en servicio `venus-loyalty` > Variables:
- `BASE_URL=https://venuscosmetologia.com.mx` (confirmar; sin ella el enlace de WhatsApp responde 503 `link_unavailable`).
- `SKIN_LAYERS_PYTHON` (ya puesta; confirmar que sigue).
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (ya puestas; confirmar).
- `SKIN_ADVISOR_*` (ya puestas; confirmar).
- NUEVA: `SKIN_SEQUENCE_ENABLED=false` (la secuencia de luz queda apagada hasta decidir).

OK: las cinco familias visibles en la lista. Si falta alguna de las ya puestas, no despliegues hasta restaurarla.

## 5. Merge y despliegue

Con autorización de Said: abre PR de `feat/skin-maps-history` hacia `main` de `said019/venus-loyalty` y haz merge (o `git push upstream feat/skin-maps-history:main` si Said prefiere). Railway despliega solo desde `main`.

OK: el deployment del servicio `venus-loyalty` termina en estado Active/Success. Si falla el build, mira los logs de build y haz Rollback (sección 8).

## 6. Verificación post-despliegue

Solo lecturas contra el sitio público; no cambian nada:
```bash
for p in /mi-piel.html /fonts/prata-latin-400-normal.woff2 /mi-piel.js /mi-piel.css; do
  curl -s -o /dev/null -w "$p %{http_code}\n" "https://venuscosmetologia.com.mx$p"; done
curl -s "https://venuscosmetologia.com.mx/api/public/card/<tarjeta de prueba>/skin-reports"
curl -s -o /dev/null -w "%{http_code}\n" "https://venuscosmetologia.com.mx/api/public/card/not-a-card/skin-reports"
```
OK: los cuatro archivos dan `200`; la tarjeta de prueba devuelve `200` con `{ "success": true, "data": [...] }`; `not-a-card` devuelve `404`. Si algo da 404/500 en el archivo estático, probablemente el deploy no es el nuevo; revisa el commit desplegado. Si el reporte da 500, revisa logs: lo más probable es una migración sin aplicar (volver al paso 3).

## 7. Cuentas

Cada cosmetóloga tiene su propia cuenta con rol `staff`; nadie usa la cuenta del dueño.
- Con autorización de Said: crear la cuenta de cada cosmetóloga desde el admin (Usuarios) o con el script. Nota: `scripts/create-admin-user.js` NO está en esta rama; existe sin versionar como `server/scripts/create-admin-user.js` en la copia de trabajo de Said. Su línea de uso no se pudo citar desde aquí: ábrela (`head -20 server/scripts/create-admin-user.js`) y copia el "Usage" que trae, o usa el admin. Verifica que cree rol `staff` y no `admin`.
- Con autorización de Said: retira la contraseña del dueño del login guardado del dispositivo (Moji): borra la credencial guardada en el navegador/gestor del dispositivo e inicia sesión con la cuenta `staff` de la cosmetóloga.

OK: cada cosmetóloga entra con su cuenta y no ve funciones de dueño.

## 8. Rollback

- Código: Railway > servicio `venus-loyalty` > Deployments > deployment anterior > "Rollback". Con autorización de Said.
- Base de datos: no se necesita down-migration; las migraciones son aditivas (tabla nueva y dos columnas nulas) y el código anterior las ignora.
- Con autorización de Said, secuencia de luz: pon `SKIN_SEQUENCE_ENABLED=false` en Railway; se apaga sin desplegar de nuevo.
