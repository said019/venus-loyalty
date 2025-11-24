import { google } from 'googleapis';
import fs from 'fs';
import readline from 'readline';

const CREDENTIALS_PATH = 'secrets/google-calendar-credentials.json';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

async function authorize() {
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(content);

    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('\n🔐 Autoriza esta aplicación visitando esta URL:\n');
    console.log(authUrl);
    console.log('\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('Pega el código de autorización aquí: ', async (code) => {
        rl.close();
        try {
            const { tokens } = await oAuth2Client.getToken(code);

            console.log('\n✅ ¡Refresh Token obtenido!\n');
            console.log('Agrega estas líneas a tu archivo .env:\n');
            console.log(`GOOGLE_CLIENT_ID=${client_id}`);
            console.log(`GOOGLE_CLIENT_SECRET=${client_secret}`);
            console.log(`GOOGLE_REDIRECT_URI=${redirect_uris[0]}`);
            console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
            console.log('\n');
        } catch (error) {
            console.error('❌ Error obteniendo el token:', error.message);
        }
    });
}

authorize();
