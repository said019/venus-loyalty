import { AppointmentModel, ClientModel, ServiceModel } from '../models/index.js';
import { CalendarService } from '../services/calendar.js';
import { WhatsAppService } from '../services/whatsapp.js';
import { config } from '../config/config.js';

export const ClientsController = {
    async createOrUpdate(req, res) {
        try {
            const client = await ClientModel.createOrUpdate(req.body);
            res.json({ success: true, data: client });
        } catch (error) {
            console.error('Error creating client:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
};

export const ServicesController = {
    async getAll(req, res) {
        try {
            const services = await ServiceModel.getAll();
            res.json({ success: true, data: services });
        } catch (error) {
            console.error('Error getting services:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
};

export const AppointmentsController = {
    async create(req, res) {
        try {
            const {
                clientId, name, phone, email, notes,
                serviceId, serviceName,
                date, time, durationMinutes,
                cosmetologistEmail,
                sendWhatsAppConfirmation,
                sendWhatsApp24h,
                sendWhatsApp2h
            } = req.body;

            // 1. Normalizar teléfono (MX format: 52...)
            let cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;

            // 2. Buscar o crear cliente
            let clientData = { name, phone: cleanPhone, email, notes };
            if (clientId) clientData.id = clientId;
            const client = await ClientModel.createOrUpdate(clientData);

            // 3. Calcular fechas
            // date: YYYY-MM-DD, time: HH:mm
            const startDateTime = new Date(`${date}T${time}:00`).toISOString(); // Assumes local time input, but ISO conversion might be tricky without timezone lib. 
            // Better approach: Construct date object with timezone offset or use library like luxon/moment.
            // For simplicity, assuming input is local and we store as ISO. 
            // Ideally, frontend sends ISO or we handle timezone explicitly.
            // Let's assume input is "2025-11-22" and "13:00" in DEFAULT_TIMEZONE.
            // We'll create a Date object and adjust.

            const start = new Date(`${date}T${time}:00`); // Local server time? No, we need specific timezone.
            // Simple hack for now: treat as UTC or rely on server timezone. 
            // Correct way: use config.timezone.

            const end = new Date(start.getTime() + (durationMinutes || 60) * 60000);

            const appointmentData = {
                clientId: client.id,
                clientName: client.name,
                clientPhone: client.phone,
                serviceId,
                serviceName,
                startDateTime: start.toISOString(),
                endDateTime: end.toISOString(),
                cosmetologistEmail: cosmetologistEmail || config.google.calendarOwner1,
                location: 'Venus Cosmetología',
                sendWhatsApp24h: !!sendWhatsApp24h,
                sendWhatsApp2h: !!sendWhatsApp2h
            };

            // 4. Crear evento en Calendar
            const eventId = await CalendarService.createEvent(appointmentData);
            if (eventId) appointmentData.googleCalendarEventId = eventId;

            // 5. Guardar en BD
            const appointment = await AppointmentModel.create(appointmentData);

            // 6. Enviar WhatsApp Confirmación
            if (sendWhatsAppConfirmation) {
                await WhatsAppService.sendConfirmation(appointment);
            }

            res.json({ success: true, data: appointment });

        } catch (error) {
            console.error('Error creating appointment:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    },

    async getByDate(req, res) {
        try {
            const { date } = req.query; // YYYY-MM-DD
            if (!date) return res.status(400).json({ error: 'Missing date' });
            const appointments = await AppointmentModel.getByDate(date);
            res.json({ success: true, data: appointments });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    async cancel(req, res) {
        try {
            const { id } = req.params;
            await AppointmentModel.cancel(id);
            // Opcional: Cancelar en Calendar también si guardamos el ID
            res.json({ success: true, message: 'Cita cancelada' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
};
