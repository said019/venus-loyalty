// src/services/googleCalendarService.js
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
    GOOGLE_APPLICATION_CREDENTIALS,
    GOOGLE_CALENDAR_ID,
    GOOGLE_ATTENDEE_1,
    GOOGLE_ATTENDEE_2,
    TIMEZONE,
} = process.env;

const calendar = google.calendar("v3");

const auth = new google.auth.GoogleAuth({
    keyFile:
        GOOGLE_APPLICATION_CREDENTIALS ||
        path.join(__dirname, "../../google-sa.json"),
    scopes: ["https://www.googleapis.com/auth/calendar"],
});

async function getAuthClient() {
    return await auth.getClient();
}

/**
 * Crea un evento en Google Calendar
 */
export async function createEvent(data) {
    const authClient = await getAuthClient();
    // Usar calendarId del parámetro, o GOOGLE_CALENDAR_ID, o "primary"
    const calendarId = data.calendarId || GOOGLE_CALENDAR_ID || "primary";

    const {
        title,
        description = "",
        location = "",
        startISO,
        endISO,
        attendees = [],
    } = data;

    const event = {
        summary: title,
        description,
        location,
        start: {
            dateTime: startISO,
            timeZone: TIMEZONE || "America/Mexico_City",
        },
        end: {
            dateTime: endISO,
            timeZone: TIMEZONE || "America/Mexico_City",
        },
        // Removed attendees - Service Account requires Domain-Wide Delegation to invite
    };

    const res = await calendar.events.insert({
        auth: authClient,
        calendarId,
        requestBody: event,
        sendUpdates: "none", // Changed from "all" to "none" since we can't send to attendees
    });

    return res.data.id;
}

/**
 * Actualiza un evento existente
 */
export async function updateEvent(eventId, data) {
    const authClient = await getAuthClient();
    const calendarId = data.calendarId || GOOGLE_CALENDAR_ID || "primary";

    const {
        title,
        description = "",
        location = "",
        startISO,
        endISO,
        attendees = [],
    } = data;

    const event = {
        summary: title,
        description,
        location,
        start: {
            dateTime: startISO,
            timeZone: TIMEZONE || "America/Mexico_City",
        },
        end: {
            dateTime: endISO,
            timeZone: TIMEZONE || "America/Mexico_City",
        },
    };

    await calendar.events.patch({
        auth: authClient,
        calendarId,
        eventId,
        requestBody: event,
        sendUpdates: "none",
    });
}

/**
 * Borra un evento del calendario
 */
export async function deleteEvent(eventId, calendarId = null) {
    const authClient = await getAuthClient();
    const calId = calendarId || GOOGLE_CALENDAR_ID || "primary";

    await calendar.events.delete({
        auth: authClient,
        calendarId: calId,
        eventId,
        sendUpdates: "none",
    });
}
