
import { firestore } from '../lib/firebase.js';
import bcrypt from 'bcryptjs';

const COL_ADMINS = 'admins';

async function resetPassword(email, newPassword) {
    if (!firestore) {
        console.error('❌ Firestore no inicializado.');
        process.exit(1);
    }

    try {
        const emailLower = email.trim().toLowerCase();
        const snapshot = await firestore.collection(COL_ADMINS).where('email', '==', emailLower).get();

        const pass_hash = await bcrypt.hash(newPassword, 10);
        const now = new Date().toISOString();

        if (snapshot.empty) {
            console.log(`⚠️ El usuario ${emailLower} no existe. Se creará uno nuevo.`);
            const id = crypto.randomUUID();
            await firestore.collection(COL_ADMINS).doc(id).set({
                id,
                email: emailLower,
                pass_hash,
                createdAt: now,
                updatedAt: now
            });
            console.log(`✅ Admin creado con nueva contraseña.`);
        } else {
            const doc = snapshot.docs[0];
            await firestore.collection(COL_ADMINS).doc(doc.id).update({
                pass_hash,
                updatedAt: now
            });
            console.log(`✅ Contraseña actualizada para ${emailLower}.`);
        }
    } catch (error) {
        console.error('❌ Error:', error);
    }
    process.exit(0);
}

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Uso: node scripts/reset_password_direct.js <email> <password>');
    process.exit(1);
}
resetPassword(args[0], args[1]);
