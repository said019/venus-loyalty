import { firestore } from '../db/compat.js';

const COL_CLIENTS = 'clients';
const COL_SERVICES = 'services';
const COL_APPOINTMENTS = 'appointments';

// --- CLIENTS ---
export const ClientModel = {
    async createOrUpdate(data) {
        // Si viene ID, actualizamos. Si no, buscamos por teléfono o creamos.
        let id = data.id;
        const now = new Date().toISOString();

        if (!id && data.phone) {
            // Buscar por teléfono
            const snap = await firestore.collection(COL_CLIENTS)
                .where('phone', '==', data.phone)
                .limit(1)
                .get();
            if (!snap.empty) {
                id = snap.docs[0].id;
            }
        }

        if (id) {
            await firestore.collection(COL_CLIENTS).doc(id).set({
                ...data,
                updatedAt: now
            }, { merge: true });
            return { id, ...data };
        } else {
            const ref = await firestore.collection(COL_CLIENTS).add({
                ...data,
                createdAt: now,
                updatedAt: now
            });
            return { id: ref.id, ...data };
        }
    },

    async getByPhone(phone) {
        const snap = await firestore.collection(COL_CLIENTS)
            .where('phone', '==', phone)
            .limit(1)
            .get();
        return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
    },

    async getById(id) {
        const doc = await firestore.collection(COL_CLIENTS).doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    }
};

// --- SERVICES ---
export const ServiceModel = {
    async getAll() {
        const snap = await firestore.collection(COL_SERVICES)
            .where('active', '==', true)
            .get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async create(data) {
        const ref = await firestore.collection(COL_SERVICES).add({
            ...data,
            active: true,
            createdAt: new Date().toISOString()
        });
        return { id: ref.id, ...data };
    },

    async update(id, data) {
        await firestore.collection(COL_SERVICES).doc(id).update({
            ...data,
            updatedAt: new Date().toISOString()
        });
        return { id, ...data };
    },

    async delete(id) {
        // Soft delete
        await firestore.collection(COL_SERVICES).doc(id).update({
            active: false,
            deletedAt: new Date().toISOString()
        });
    },

    async upsert(data) {
        // Buscar por nombre exacto para evitar duplicados al importar
        const snap = await firestore.collection(COL_SERVICES)
            .where('name', '==', data.name)
            .limit(1)
            .get();

        if (!snap.empty) {
            const id = snap.docs[0].id;
            await firestore.collection(COL_SERVICES).doc(id).update(data);
            return { id, ...data, action: 'updated' };
        } else {
            const ref = await firestore.collection(COL_SERVICES).add({ ...data, active: true });
            return { id: ref.id, ...data, action: 'created' };
        }
    }
};

// --- APPOINTMENTS ---
export const AppointmentModel = {
    async create(data) {
        const now = new Date().toISOString();
        const docData = {
            ...data,
            status: 'scheduled',
            createdAt: now,
            updatedAt: now,
            // Guardar flags de WhatsApp directamente para compatibilidad
            sendWhatsApp24h: data.sendWhatsApp24h || false,
            sendWhatsApp2h: data.sendWhatsApp2h || false,
            reminders: {
                send24h: data.sendWhatsApp24h || false,
                send2h: data.sendWhatsApp2h || false,
                sent24hAt: null,
                sent2hAt: null
            }
        };
        const ref = await firestore.collection(COL_APPOINTMENTS).add(docData);
        return { id: ref.id, ...docData };
    },

    async getByDate(dateStr) {
        // dateStr YYYY-MM-DD
        // Buscar rango del día con timezone de México
        const start = `${dateStr}T00:00:00-06:00`;
        const end = `${dateStr}T23:59:59-06:00`;

        const snap = await firestore.collection(COL_APPOINTMENTS)
            .where('startDateTime', '>=', start)
            .where('startDateTime', '<=', end)
            .get();

        // Filtrar cancelled en código para evitar índice compuesto
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(appt => appt.status !== 'cancelled');
    },

    async cancel(id) {
        await firestore.collection(COL_APPOINTMENTS).doc(id).update({
            status: 'cancelled',
            updatedAt: new Date().toISOString()
        });
    },

    // Para el scheduler
    async getPendingReminders(type, rangeStart, rangeEnd) {
        // type: 'send24h' o 'send2h'
        // rangeStart/End: ISO strings
        
        console.log(`🔍 Buscando recordatorios ${type} entre ${rangeStart} y ${rangeEnd}`);

        // Simplificado: traer todas las citas scheduled en el rango y filtrar en código
        const snap = await firestore.collection(COL_APPOINTMENTS)
            .where('startDateTime', '>=', rangeStart)
            .where('startDateTime', '<=', rangeEnd)
            .get();

        console.log(`   📦 Encontradas ${snap.size} citas en el rango`);

        // Filtrar en código
        const reminderField = type === 'send24h' ? 'sent24hAt' : 'sent2hAt';
        const sendField = type === 'send24h' ? 'sendWhatsApp24h' : 'sendWhatsApp2h';
        
        const pending = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => {
                // Debe estar scheduled o confirmed
                if (a.status !== 'scheduled' && a.status !== 'confirmed') return false;
                
                // Debe tener el flag de envío activado
                if (!a[sendField] && !a.reminders?.[type]) return false;
                
                // No debe haberse enviado ya
                if (a.reminders?.[reminderField]) return false;
                
                return true;
            });

        console.log(`   ✅ ${pending.length} citas pendientes de recordatorio`);
        return pending;
    },

    async markReminderSent(id, type) {
        // type: '24h' o '2h'
        const field = `reminders.sent${type}At`;
        await firestore.collection(COL_APPOINTMENTS).doc(id).update({
            [field]: new Date().toISOString()
        });
    }
};
