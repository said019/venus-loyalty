
import { firestore } from '../lib/firebase.js';
import crypto from 'crypto';

const COL_ADMINS = 'admins';
const COL_RESETS = 'admin_resets';

async function generateLink(email) {
    if (!firestore) {
        console.error('❌ Firestore no inicializado.');
        process.exit(1);
    }

    if (!email) {
        console.error('❌ Uso: node scripts/generate_reset_link.js <email>');
        process.exit(1);
    }

    try {
        const snapshot = await firestore.collection(COL_ADMINS).where('email', '==', email.trim().toLowerCase()).get();

        if (snapshot.empty) {
            console.error('❌ No se encontró ningún administrador con ese correo.');
            process.exit(1);
        }

        const doc = snapshot.docs[0];
        const admin = { id: doc.id, ...doc.data() };

        // Generar token
        const token = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

        await firestore.collection(COL_RESETS).doc(token).set({
            token,
            adminId: admin.id,
            email: admin.email,
            expiresAt
        });

        const baseUrl = 'https://venus-loyalty.onrender.com'; // O localhost si prefieres
        const link = `${baseUrl}/admin-login.html?view=reset&token=${token}`;

        console.log('\n✅ Enlace de recuperación generado (válido 30 min):');
        console.log('---------------------------------------------------');
        console.log(link);
        console.log('---------------------------------------------------');
        console.log('👉 Copia este enlace y envíalo a', email);

    } catch (error) {
        console.error('❌ Error:', error);
    }
    process.exit(0);
}

const args = process.argv.slice(2);
generateLink(args[0]);
