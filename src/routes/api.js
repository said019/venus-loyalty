import express from 'express';
import { ClientsController, ServicesController, AppointmentsController } from '../controllers/index.js';

const router = express.Router();

// Clients
router.post('/clients', ClientsController.createOrUpdate);

// Services
router.get('/services', ServicesController.getAll);
router.post('/services', ServicesController.create);
router.put('/services/:id', ServicesController.update);
router.delete('/services/:id', ServicesController.delete);

// Appointments
router.post('/appointments', AppointmentsController.create);
router.get('/appointments/month', AppointmentsController.getByMonth);
router.get('/appointments/client', AppointmentsController.getByClient);
router.patch('/appointments/:id/cancel', AppointmentsController.cancel);
router.get('/appointments/:id', AppointmentsController.getById);
router.patch('/appointments/:id', AppointmentsController.update);
router.post('/appointments/:id/payment', AppointmentsController.registerPayment);
router.get('/appointments', AppointmentsController.getByDate);

// Debug: Ver citas pendientes de recordatorio
router.get('/debug/pending-reminders', async (req, res) => {
    try {
        const { AppointmentModel } = await import('../models/index.js');
        const now = new Date();
        
        // Rango 24h
        const start24h = new Date(now.getTime() + 23.5 * 60 * 60 * 1000).toISOString();
        const end24h = new Date(now.getTime() + 24.5 * 60 * 60 * 1000).toISOString();
        
        // Rango 2h
        const start2h = new Date(now.getTime() + 1.5 * 60 * 60 * 1000).toISOString();
        const end2h = new Date(now.getTime() + 2.5 * 60 * 60 * 1000).toISOString();
        
        const pending24h = await AppointmentModel.getPendingReminders('send24h', start24h, end24h);
        const pending2h = await AppointmentModel.getPendingReminders('send2h', start2h, end2h);
        
        res.json({
            success: true,
            now: now.toISOString(),
            ranges: {
                '24h': { start: start24h, end: end24h },
                '2h': { start: start2h, end: end2h }
            },
            pending: {
                '24h': pending24h,
                '2h': pending2h
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Debug: Forzar envío de recordatorio
router.post('/debug/send-reminder/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.body; // '24h' o '2h'
        
        const { firestore } = await import('../../lib/firebase.js');
        const { WhatsAppService } = await import('../services/whatsapp.js');
        const { AppointmentModel } = await import('../models/index.js');
        
        const doc = await firestore.collection('appointments').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ success: false, error: 'Cita no encontrada' });
        }
        
        const appt = { id: doc.id, ...doc.data() };
        
        let result;
        if (type === '2h') {
            result = await WhatsAppService.sendReminder2h(appt);
        } else {
            result = await WhatsAppService.sendReminder24h(appt);
        }
        
        if (result.success) {
            await AppointmentModel.markReminderSent(id, type);
        }
        
        res.json({ success: result.success, result, appointment: appt });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
