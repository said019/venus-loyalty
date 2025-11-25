import { AppointmentModel, ClientModel, ServiceModel } from '../models/index.js';
import { CalendarService } from '../services/calendar.js';
import { WhatsAppService } from '../services/whatsapp.js';
import { config } from '../config/config.js';
import axios from 'axios';

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

            // 2. Buscar o crear cliente (filtrar undefined)
            let clientData = { name, phone: cleanPhone };
            if (email) clientData.email = email;
            if (notes) clientData.notes = notes;
            if (clientId) clientData.id = clientId;
            const client = await ClientModel.createOrUpdate(clientData);

            // 3. Calcular fechas ISO
            const startDateTime = `${date}T${time}:00-06:00`; // Mexico City timezone
            const start = new Date(startDateTime);
            const end = new Date(start.getTime() + (durationMinutes || 60) * 60000);
            const endDateTime = end.toISOString();

            const appointmentData = {
                clientId: client.id,
                clientName: client.name,
                clientPhone: client.phone,
                serviceId,
                serviceName,
                startDateTime,
                endDateTime,
                location: 'Venus Cosmetología',
                sendWhatsApp24h: !!sendWhatsApp24h,
                sendWhatsApp2h: !!sendWhatsApp2h
            };

            // Siempre agregar cosmetologistEmail (usar default si no viene del frontend)
            appointmentData.cosmetologistEmail = cosmetologistEmail || config.google.calendarOwner1;

            // 4. Crear evento en AMBOS calendarios de Google (Said y Alondra)
            const eventData = {
                title: `${serviceName} - ${client.name}`,
                description: `Cliente: ${client.name}\nTel: ${client.phone}\nServicio: ${serviceName}`,
                location: 'Cactus 50, San Juan del Río',
                startISO: startDateTime,
                endISO: endDateTime
            };

            try {
                const { createEvent } = await import('../services/googleCalendarService.js');

                console.log('📅 Intentando crear eventos en calendarios...');
                console.log('   Calendar 1:', config.google.calendarOwner1);
                console.log('   Calendar 2:', config.google.calendarOwner2);

                // Crear en calendario 1 (Said)
                try {
                    const eventId1 = await createEvent({
                        ...eventData,
                        calendarId: config.google.calendarOwner1 // saidromero19@gmail.com
                    });
                    appointmentData.googleCalendarEventId = eventId1;
                    console.log(`✅ Evento creado en calendar 1: ${eventId1}`);
                } catch (err1) {
                    console.error(`❌ Error en calendar 1 (${config.google.calendarOwner1}):`, err1.message);
                }

                // Crear en calendario 2 (Alondra)
                try {
                    const eventId2 = await createEvent({
                        ...eventData,
                        calendarId: config.google.calendarOwner2 // alondraosornom@gmail.com
                    });
                    appointmentData.googleCalendarEventId2 = eventId2;
                    console.log(`✅ Evento creado en calendar 2: ${eventId2}`);
                } catch (err2) {
                    console.error(`❌ Error en calendar 2 (${config.google.calendarOwner2}):`, err2.message);
                }

            } catch (calErr) {
                console.error('⚠️ Error creating calendar event:', calErr.message);
                // Continue anyway - don't block appointment creation
            }

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
