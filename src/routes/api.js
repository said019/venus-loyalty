import express from 'express';
import { ClientsController, ServicesController, AppointmentsController } from '../controllers/index.js';

const router = express.Router();

// Clients
router.post('/clients', ClientsController.createOrUpdate);

// Services
router.get('/services', ServicesController.getAll);

// Appointments
router.post('/appointments', AppointmentsController.create);
router.get('/appointments', AppointmentsController.getByDate);
router.get('/appointments/:id', AppointmentsController.getById);
router.patch('/appointments/:id', AppointmentsController.update);
router.patch('/appointments/:id/cancel', AppointmentsController.cancel);

export default router;
