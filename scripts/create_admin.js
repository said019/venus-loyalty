
import { firestore } from '../lib/firebase.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const COL_ADMINS = 'admins';

async function createAdmin(email, password) {
    if (!firestore) {
        console.error('❌ Firestore no inicializado. Revisa tus credenciales.');
        process.exit(1);
    }

    if (!email || !password) {
        console.error('❌ Uso: node scripts/create_admin.js <email> <password>');
        process.exit(1);
    }

    try {
        // Verificar si ya existe
        const snapshot = await firestore.collection(COL_ADMINS).where('email', '==', email).get();
        if (!snapshot.empty) {
            console.log('⚠️ El usuario ya existe.');
            process.exit(0);
        }

        const id = crypto.randomUUID();
        const pass_hash = await bcrypt.hash(password, 10);
        const now = new Date().toISOString();

        await firestore.collection(COL_ADMINS).doc(id).set({
            id,
            email: email.trim().toLowerCase(),
            pass_hash,
            createdAt: now,
            updatedAt: now
        });

        console.log(`✅ Admin creado: ${email}`);
    } catch (error) {
        console.error('❌ Error creando admin:', error);
    }
    process.exit(0);
}

const args = process.argv.slice(2);
createAdmin(args[0], args[1]);
