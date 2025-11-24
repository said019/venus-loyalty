import xlsx from 'xlsx';
import { ServiceModel } from '../src/models/index.js';
import path from 'path';

// Uso: node scripts/import-services.js ./data/services.xlsx

async function importServices(filePath) {
    try {
        console.log(`📂 Leyendo archivo: ${filePath}`);
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet);

        console.log(`📊 Encontradas ${rows.length} filas. Procesando...`);

        let created = 0;
        let updated = 0;
        let skipped = 0;

        for (const row of rows) {
            // Mapeo de columnas (ajustar según el Excel real)
            // Asumimos: "Nombre del servicio", "Precio", "Duración (minutos)", "Categoría", "Activo"
            const name = row['Nombre del servicio'] || row['Nombre'] || row['Servicio'];

            if (!name) {
                skipped++;
                continue;
            }

            const serviceData = {
                name: String(name).trim(),
                price: parseFloat(row['Precio'] || 0),
                durationMinutes: parseInt(row['Duración (minutos)'] || row['Duracion'] || 60),
                category: row['Categoría'] || row['Categoria'] || 'General',
                active: row['Activo'] === true || row['Activo'] === 'SI' || row['Visible online'] === true
            };

            const result = await ServiceModel.upsert(serviceData);
            if (result.action === 'created') created++;
            else updated++;
        }

        console.log('✅ Importación completada');
        console.log(`🆕 Creados: ${created}`);
        console.log(`🔄 Actualizados: ${updated}`);
        console.log(`⏭️ Saltados: ${skipped}`);

    } catch (error) {
        console.error('❌ Error importando servicios:', error);
    }
}

// Ejecutar si se llama directamente
if (process.argv[2]) {
    const file = path.resolve(process.argv[2]);
    importServices(file);
}
