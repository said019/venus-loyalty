// Prueba manual contra Drive real: node scripts/test-drive.js
// Requiere GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID y credenciales SA en .env
import 'dotenv/config';
import { ensureClientFolder, uploadBuffer, isDriveConfigured } from '../src/services/driveService.js';

if (!isDriveConfigured()) { console.log('⚠️ Drive no configurado (falta GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID)'); process.exit(1); }

const folderId = await ensureClientFolder({ name: 'Prueba Sistema', phone: '5200000000000' });
console.log('folderId:', folderId);
const res = await uploadBuffer({ folderId, name: `test-${Date.now()}.txt`, mimeType: 'text/plain', buffer: Buffer.from('hola venus') });
console.log('✅ Drive OK →', res.webViewLink);
