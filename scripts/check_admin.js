
import { firestore } from '../lib/firebase.js';

const COL_ADMINS = 'admins';

async function listAdmins() {
    if (!firestore) {
        console.error('❌ Firestore no inicializado. Revisa tus credenciales.');
        process.exit(1);
    }

    console.log('🔍 Buscando administradores...');
    try {
        const snapshot = await firestore.collection(COL_ADMINS).get();
        if (snapshot.empty) {
            console.log('⚠️ No hay administradores registrados.');
        } else {
            console.log(`✅ Se encontraron ${snapshot.size} administradores:`);
            snapshot.forEach(doc => {
                console.log(` - ${doc.id} => ${doc.data().email}`);
            });
        }
    } catch (error) {
        console.error('❌ Error consultando admins:', error);
    }
    process.exit(0);
}

listAdmins();
