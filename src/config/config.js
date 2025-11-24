import 'dotenv/config';

export const config = {
    port: process.env.PORT || 3000,
    whatsapp: {
        apiVersion: process.env.WHATSAPP_API_VERSION || 'v22.0',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        token: process.env.WHATSAPP_PERMANENT_TOKEN
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        calendarOwner1: process.env.CALENDAR_OWNER_EMAIL_1,
        calendarOwner2: process.env.CALENDAR_OWNER_EMAIL_2
    },
    timezone: process.env.DEFAULT_TIMEZONE || 'America/Mexico_City'
};
