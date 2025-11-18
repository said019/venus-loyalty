// lib/firebase.js
import admin from 'firebase-admin';

// Opción 1: Si tienes el JSON como variable de entorno
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
      });
    }
  } catch (error) {
    console.error('Error parsing service account:', error);
  }
} 
// Opción 2: Si tienes el archivo JSON local
else {
  try {
    const serviceAccount = require('./service-account-key.json');
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
      });
    }
  } catch (error) {
    console.error('Error loading service account file:', error);
  }
}

const db = admin.firestore();
export { db, admin };