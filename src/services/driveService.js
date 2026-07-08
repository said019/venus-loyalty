// src/services/driveService.js
// Sube expedientes (PDFs generados y escaneados) a Google Drive.
// Usa la MISMA service account que Calendar/Wallet (lib/google.js loadServiceAccount).
// Estructura: carpeta raíz (GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID, compartida con la SA)
//   └── "{Nombre} – {teléfono}" (una carpeta por clienta, creada on-demand)
import { google } from 'googleapis';
import { loadServiceAccount } from '../../lib/google.js';

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID;
const SCOPES = ['https://www.googleapis.com/auth/drive'];

let driveClient = null;

export function isDriveConfigured() {
  return Boolean(ROOT_FOLDER_ID);
}

async function getDrive() {
  if (driveClient) return driveClient;
  const { client_email, private_key } = loadServiceAccount();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: SCOPES,
  });
  driveClient = google.drive({ version: 'v3', auth: await auth.getClient() });
  return driveClient;
}

// Escapa comillas simples para queries de Drive
const q = (s) => String(s).replace(/'/g, "\\'");

export async function ensureClientFolder(card) {
  if (!ROOT_FOLDER_ID) throw new Error('GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID no configurado');
  const drive = await getDrive();
  const folderName = `${card.name || 'Clienta'} – ${card.phone || 'sin-tel'}`.trim();

  const found = await drive.files.list({
    q: `name='${q(folderName)}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (found.data.files?.length) return found.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [ROOT_FOLDER_ID],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id;
}

export async function uploadBuffer({ folderId, name, mimeType, buffer }) {
  const drive = await getDrive();
  const { Readable } = await import('stream');
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  return { id: res.data.id, webViewLink: res.data.webViewLink };
}
