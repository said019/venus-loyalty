import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(__dirname, '../google-sa.json');

async function listCalendars() {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: GOOGLE_APPLICATION_CREDENTIALS,
            scopes: ['https://www.googleapis.com/auth/calendar']
        });

        const authClient = await auth.getClient();
        const calendar = google.calendar('v3');

        console.log('🔍 Listando calendarios accesibles...\n');

        const res = await calendar.calendarList.list({
            auth: authClient
        });

        if (!res.data.items || res.data.items.length === 0) {
            console.log('❌ No se encontraron calendarios accesibles.');
            console.log('\n⚠️  Esto significa que ningún calendario ha sido compartido con el Service Account.');
            console.log('\nPara compartir un calendario:');
            console.log('1. Ve a Google Calendar');
            console.log('2. Haz clic en los 3 puntos del calendario');
            console.log('3. "Configuración y uso compartido"');
            console.log('4. "Compartir con usuarios específicos"');
            console.log('5. Agrega el email del Service Account');
            console.log('6. Dale permisos "Hacer cambios en eventos"');
            return;
        }

        console.log(`✅ Encontrados ${res.data.items.length} calendarios:\n`);

        res.data.items.forEach((cal, idx) => {
            console.log(`📅 Calendario ${idx + 1}:`);
            console.log(`   ID: ${cal.id}`);
            console.log(`   Nombre: ${cal.summary}`);
            console.log(`   Acceso: ${cal.accessRole}`);
            console.log(`   Primario: ${cal.primary || false}`);
            console.log('');
        });

        console.log('\n💡 Usa estos IDs en las variables de entorno:');
        console.log('   GOOGLE_ATTENDEE_1=<uno de los IDs de arriba>');
        console.log('   GOOGLE_ATTENDEE_2=<otro ID de arriba>');

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.message.includes('ENOENT')) {
            console.log('\n⚠️  No se encontró el archivo google-sa.json');
            console.log('Asegúrate de que la variable GOOGLE_APPLICATION_CREDENTIALS esté configurada');
        }
    }
}

listCalendars();
