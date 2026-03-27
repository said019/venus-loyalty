import 'dotenv/config';

export const config = {
    port: process.env.PORT || 3000,
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    // Evolution API (WhatsApp)
    evolution: {
        apiUrl: process.env.EVOLUTION_API_URL,
        apiKey: process.env.EVOLUTION_API_KEY,
        instanceName: process.env.EVOLUTION_INSTANCE_NAME || 'venus-loyalty'
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        // OAuth2 redirect — ejemplo: https://tudominio.com/api/admin/calendar/callback
        oauthRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/admin/calendar/callback',
        calendarOwner1: process.env.GOOGLE_ATTENDEE_1 || 'saidromero19@gmail.com',
        calendarOwner2: process.env.GOOGLE_ATTENDEE_2 || 'alondraosornom@gmail.com'
    },
    timezone: process.env.DEFAULT_TIMEZONE || 'America/Mexico_City',
    venus: {
        location: 'Cactus 50, San Juan del Río'
    }
};
