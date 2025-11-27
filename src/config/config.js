import 'dotenv/config';

export const config = {
    port: process.env.PORT || 3000,
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'
    },
    // Template SIDs de Twilio (ya aprobados)
    templates: {
        CONFIRMACION_CITA: 'HXd7b477afe0353eed28c16b3b40938a8f',    // 5 vars: Nombre, Servicio, Fecha, Hora, Lugar
        RECORDATORIO_24H: 'HX7df380cf1918f41f494099a41dc39315',    // 4 vars: Nombre, Servicio, Fecha, Hora
        RECORDATORIO_2H: 'HX93138eb3f7705c8e5601b139358f1528',     // 3 vars: Nombre, Servicio, Hora
        CONFIRMACION: 'HX1fcf9772319524060c53c9555d272dd',          // 3 vars: Nombre, Fecha, Hora (cuando cliente confirma)
        REPROGRAMAR: 'HX066c8568b497a5cc795eadc4afafcd29',          // 1 var: Nombre
        CANCELACION_CONFIRMADA: 'HX5e7e284e1a5272535beef9fd780a22b6' // 1 var: Nombre
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        calendarOwner1: process.env.GOOGLE_ATTENDEE_1 || 'saidromero19@gmail.com',
        calendarOwner2: process.env.GOOGLE_ATTENDEE_2 || 'alondraosornom@gmail.com'
    },
    timezone: process.env.DEFAULT_TIMEZONE || 'America/Mexico_City',
    venus: {
        location: 'Cactus 50, San Juan del Río'
    }
};
