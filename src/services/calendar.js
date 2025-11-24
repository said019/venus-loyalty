import { google } from 'googleapis';
import { config } from '../config/config.js';

const oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
);

// Set credentials (refresh token is key for offline access)
if (config.google.refreshToken) {
    oauth2Client.setCredentials({
        refresh_token: config.google.refreshToken
    });
}

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

export const CalendarService = {
    async createEvent(appointment) {
        if (!config.google.refreshToken) {
            console.warn('⚠️ Google Calendar: No Refresh Token configured. Skipping event creation.');
            return null;
        }

        const event = {
            summary: `Cita: ${appointment.serviceName} - ${appointment.clientName}`,
            description: `Cliente: ${appointment.clientName}\nTel: ${appointment.clientPhone}\nServicio: ${appointment.serviceName}\nNotas: ${appointment.notes || ''}`,
            start: {
                dateTime: appointment.startDateTime, // ISO format
                timeZone: config.timezone,
            },
            end: {
                dateTime: appointment.endDateTime, // ISO format
                timeZone: config.timezone,
            },
            location: appointment.location || 'Venus Cosmetología',
            attendees: [
                { email: config.google.calendarOwner1 },
                { email: config.google.calendarOwner2 }
            ].filter(a => a.email), // Filter out undefined
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 },
                    { method: 'popup', minutes: 30 },
                ],
            },
        };

        try {
            const res = await calendar.events.insert({
                calendarId: config.google.calendarOwner1 || 'primary',
                resource: event,
            });
            console.log(`✅ Evento creado en Calendar: ${res.data.htmlLink}`);
            return res.data.id;
        } catch (error) {
            console.error('❌ Error creando evento en Google Calendar:', error);
            return null; // Don't block the flow if calendar fails
        }
    }
};
