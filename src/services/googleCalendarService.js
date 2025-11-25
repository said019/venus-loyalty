// src/services/googleCalendarService.js
const { google } = require("googleapis");
const path = require("path");

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
async function createEvent(data) {
    const authClient = await getAuthClient();
    const calendarId = GOOGLE_CALENDAR_ID || "primary";

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
        attendees: [
            GOOGLE_ATTENDEE_1 ? { email: GOOGLE_ATTENDEE_1 } : null,
            GOOGLE_ATTENDEE_2 ? { email: GOOGLE_ATTENDEE_2 } : null,
            ...attendees,
        ].filter(Boolean),
    };

    const res = await calendar.events.insert({
        auth: authClient,
        calendarId,
        requestBody: event,
        sendUpdates: "all",
    });

    return res.data.id;
}

/**
 * Actualiza un evento existente
 */
async function updateEvent(eventId, data) {
    const authClient = await getAuthClient();
    const calendarId = GOOGLE_CALENDAR_ID || "primary";

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
        attendees: [
            GOOGLE_ATTENDEE_1 ? { email: GOOGLE_ATTENDEE_1 } : null,
            GOOGLE_ATTENDEE_2 ? { email: GOOGLE_ATTENDEE_2 } : null,
            ...attendees,
        ].filter(Boolean),
    };

    await calendar.events.patch({
        auth: authClient,
        calendarId,
        eventId,
        requestBody: event,
        sendUpdates: "all",
    });
}

/**
 * Borra un evento del calendario
 */
async function deleteEvent(eventId) {
    const authClient = await getAuthClient();
    const calendarId = GOOGLE_CALENDAR_ID || "primary";

    await calendar.events.delete({
        auth: authClient,
        calendarId,
        eventId,
        sendUpdates: "all",
    });
}

module.exports = {
    createEvent,
    updateEvent,
    deleteEvent,
};
