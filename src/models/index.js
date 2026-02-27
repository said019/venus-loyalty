import { firestore } from '../db/compat.js';
import { extractDateAndTime } from '../utils/mexico-time.js';

const COL_CLIENTS = 'clients';
const COL_SERVICES = 'services';
const COL_APPOINTMENTS = 'appointments';

// --- CLIENTS ---
export const ClientModel = {
    async createOrUpdate(data) {
        // Si viene ID, actualizamos. Si no, buscamos por teléfono o creamos.
        let id = data.id;
        const now = new Date().toISOString();

        // Normalizar teléfono (debe coincidir con la normalización en repositories.js)
        if (data.phone) {
            let cleanPhone = data.phone.replace(/\D/g, '');
            if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;
            data.phone = cleanPhone;
        }

        if (!id && data.phone) {
            // Buscar por teléfono normalizado
            const snap = await firestore.collection(COL_CLIENTS)
                .where('phone', '==', data.phone)
                .limit(1)
                .get();
            if (!snap.empty) {
                id = snap.docs[0].id;
            }

            // Si no se encuentra con prefijo 52, intentar sin él (para backward compatibility)
            if (!id && data.phone.startsWith('52') && data.phone.length === 12) {
                const phoneWithout52 = data.phone.substring(2);
                const snap2 = await firestore.collection(COL_CLIENTS)
                    .where('phone', '==', phoneWithout52)
                    .limit(1)
                    .get();
                if (!snap2.empty) {
                    id = snap2.docs[0].id;
                    // Actualizar el teléfono de la tarjeta existente con el prefijo 52
                    await firestore.collection(COL_CLIENTS).doc(id).set({
                        phone: data.phone
                    }, { merge: true });
                }
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
        // Extraer date y time del startDateTime si no vienen
        let date = data.date;
        let time = data.time;
        if (!date && data.startDateTime) {
            // startDateTime viene como "2025-01-02T10:00:00-06:00" — extraer usando timezone Ciudad de México
            const extracted = extractDateAndTime(data.startDateTime);
            date = extracted.date;
            time = extracted.time;
        }

        const docData = {
            clientName: data.clientName,
            clientPhone: data.clientPhone,
            serviceName: data.serviceName,
            serviceId: data.serviceId || null,
            date,
            time,
            startDateTime: data.startDateTime,
            endDateTime: data.endDateTime,
            durationMinutes: data.durationMinutes || 60,
            status: 'scheduled',
            location: data.location || null,
            cardId: data.clientId || data.cardId || null, // clientId -> cardId
            googleCalendarEventId: data.googleCalendarEventId || null,
            googleCalendarEventId2: data.googleCalendarEventId2 || null,
            sendWhatsApp24h: data.sendWhatsApp24h || false,
            sendWhatsApp2h: data.sendWhatsApp2h || false,
        };

        const ref = await firestore.collection(COL_APPOINTMENTS).add(docData);
        return { id: ref.id, ...docData };
    },

    async getByDate(dateStr) {
        // dateStr YYYY-MM-DD
        console.log(`📅 [getByDate] Buscando citas para fecha: ${dateStr}`);

        // Buscar por campo 'date' directamente (más confiable que comparar startDateTime con timezone)
        const snap = await firestore.collection(COL_APPOINTMENTS)
            .where('date', '==', dateStr)
            .get();

        console.log(`📦 [getByDate] Encontradas ${snap.size} citas para ${dateStr}`);

        // Filtrar cancelled en código para evitar índice compuesto
        const results = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(appt => appt.status !== 'cancelled');

        console.log(`✅ [getByDate] Retornando ${results.length} citas (excluidas canceladas)`);
        return results;
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

        // Campos para PostgreSQL (sin objeto reminders)
        let sendField, sentField;
        if (type === 'send30h') {
            sendField = 'sendWhatsApp30h';
            sentField = 'sent30hAt';
        } else if (type === 'send24h') {
            sendField = 'sendWhatsApp24h';
            sentField = 'sent24hAt';
        } else {
            sendField = 'sendWhatsApp2h';
            sentField = 'sent2hAt';
        }

        const pending = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => {
                // Debe estar scheduled o confirmed
                if (a.status !== 'scheduled' && a.status !== 'confirmed') return false;

                // Debe tener el flag de envío activado (sendWhatsApp24h o sendWhatsApp2h)
                if (!a[sendField]) return false;

                // No debe haberse enviado ya (sent24hAt o sent2hAt debe ser null)
                if (a[sentField]) return false;

                return true;
            });

        console.log(`   ✅ ${pending.length} citas pendientes de recordatorio`);
        return pending;
    },

    async markReminderSent(id, type) {
        // type: '30h', '24h' o '2h'
        // Campos directos para PostgreSQL (sin objeto reminders)
        let field;
        if (type === '30h') field = 'sent30hAt';
        else if (type === '24h') field = 'sent24hAt';
        else field = 'sent2hAt';
        
        await firestore.collection(COL_APPOINTMENTS).doc(id).update({
            [field]: new Date().toISOString()
        });
    },

    /**
     * Obtiene citas que faltan ~4h, no están confirmadas y no se les ha enviado alerta de cancelación
     */
    async getPendingConfirmationAlert(rangeStart, rangeEnd) {
        console.log(`🔍 Buscando citas no confirmadas 4h antes entre ${rangeStart} y ${rangeEnd}`);

        const snap = await firestore.collection(COL_APPOINTMENTS)
            .where('startDateTime', '>=', rangeStart)
            .where('startDateTime', '<=', rangeEnd)
            .get();

        console.log(`   📦 Encontradas ${snap.size} citas en el rango`);

        const pending = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => {
                // Solo citas agendadas (no confirmadas) sin cancelar
                if (a.status !== 'scheduled') return false;
                // No enviar si ya se mandó la alerta de cancelación
                if (a.sentConfirmationAlertAt) return false;
                return true;
            });

        console.log(`   ✅ ${pending.length} citas sin confirmar que requieren alerta`);
        return pending;
    },

    /**
     * Marca que se envió la alerta de confirmación/cancelación 4h antes
     */
    async markConfirmationAlertSent(id) {
        await firestore.collection(COL_APPOINTMENTS).doc(id).update({
            sentConfirmationAlertAt: new Date().toISOString()
        });
    },

    /**
     * Obtiene citas que recibieron alerta y siguen sin confirmar (para cancelación automática ~1h antes)
     */
    async getPendingAutoCancelation(rangeStart, rangeEnd) {
        console.log(`🔍 Buscando citas para cancelación automática entre ${rangeStart} y ${rangeEnd}`);

        const snap = await firestore.collection(COL_APPOINTMENTS)
            .where('startDateTime', '>=', rangeStart)
            .where('startDateTime', '<=', rangeEnd)
            .get();

        const pending = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => {
                // Solo scheduled (no confirmadas ni canceladas)
                if (a.status !== 'scheduled') return false;
                // Solo las que ya recibieron la alerta de cancelación
                if (!a.sentConfirmationAlertAt) return false;
                // Que no se haya procesado ya la cancelación automática
                if (a.autoCancelledAt) return false;
                return true;
            });

        console.log(`   ✅ ${pending.length} citas para cancelar automáticamente`);
        return pending;
    }
};
