import { firestore } from '../../lib/firebase.js';

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
        // Buscar rango del día
        const start = `${dateStr}T00:00:00`;
        const end = `${dateStr}T23:59:59`;

        const snap = await firestore.collection(COL_APPOINTMENTS)
            .where('startDateTime', '>=', start)
            .where('startDateTime', '<=', end)
            .where('status', '!=', 'cancelled') // Firestore requiere índice compuesto para esto, si falla quitar status
            .get();

        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

        // Nota: Firestore queries complejas pueden requerir índices.
        // Simplificamos trayendo las 'scheduled' y filtrando en código si es necesario, 
        // o usamos query exacta si tenemos índices.

        const snap = await firestore.collection(COL_APPOINTMENTS)
            .where('status', '==', 'scheduled')
            .where(`reminders.${type}`, '==', true)
            .where('startDateTime', '>=', rangeStart)
            .where('startDateTime', '<=', rangeEnd)
            .get();

        // Filtrar las que NO tengan sentXAt
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => !a.reminders[`sent${type.replace('send', '')}At`]);
    },

    async markReminderSent(id, type) {
        // type: '24h' o '2h'
        const field = `reminders.sent${type}At`;
        await firestore.collection(COL_APPOINTMENTS).doc(id).update({
            [field]: new Date().toISOString()
        });
    }
};
