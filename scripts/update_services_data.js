import 'dotenv/config';
import { firestore } from '../lib/firebase.js';

async function updateServices() {
    console.log('Starting service description update...');

    try {
        const servicesRef = firestore.collection('services');
        const snapshot = await servicesRef.get();
        const updates = [];

        const descriptions = {
            'Diagnóstico Facial': {
                desc: [
                    'Ficha clínica',
                    'Evaluación de la piel',
                    'Seguimiento de tratamientos',
                    'Skin analyzer',
                    'Recomendaciones',
                    'Resolución de dudas e inquietudes'
                ],
                discount: '10% descuento en efectivo'
            },
            'Dermapen': {
                desc: [
                    'Diagnóstico facial',
                    'Expediente clínico',
                    'Exfoliante químico',
                    'Láser médico-estético',
                    'Ampolleta específica',
                    'Mascarilla anti-acné',
                    'Ácido salicílico localizado',
                    'Protector solar'
                ],
                discount: '10% descuento en efectivo'
            },
            'Facial Vitamina C': {
                desc: [
                    'Limpieza facial',
                    'Exfoliante facial',
                    'Vitamina C pura',
                    'Mascarilla Plástica Vitamina C',
                    'Hidratación antioxidante',
                    'Protector solar'
                ],
                discount: '10% descuento en efectivo'
            },
            'Facial Personalizado': {
                desc: [
                    'Diagnóstico general',
                    'Limpieza',
                    'Exfoliación específica',
                    'Láser/radiofrecuencia/Ems/IPL/ozonoterapia',
                    'Ampolleta específica',
                    'Mascarilla',
                    'Serum específico',
                    'Contorno de ojos',
                    'Protector solar'
                ],
                discount: '10% descuento en efectivo'
            },
            'Depilación Láser': { // Generic matching
                desc: [
                    'Tecnología Láser Diodo',
                    'Eliminación progresiva del vello',
                    'Sesiones mensuales',
                    'Sin dolor',
                    'Resultados desde la primera sesión'
                ],
                discount: null
            }
        };

        let count = 0;

        // We can't use forEach with async properly if we want to wait, but here we just push promises
        // Actually snapshot.forEach is synchronous iteration over docs
        snapshot.forEach(doc => {
            const data = doc.data();
            const name = data.name;
            let matchedKey = null;

            // Exact match
            if (descriptions[name]) {
                matchedKey = name;
            }
            // Partial match for Depilacion
            else if (name && name.toLowerCase().includes('depilación')) {
                matchedKey = 'Depilación Láser';
            }

            if (matchedKey) {
                console.log(`Updating ${name} (ID: ${doc.id}) with description for ${matchedKey}`);
                updates.push(servicesRef.doc(doc.id).update({
                    description: descriptions[matchedKey].desc,
                    discount: descriptions[matchedKey].discount
                }));
                count++;
            }
        });

        if (updates.length === 0) {
            console.log('No services matched for update.');
        } else {
            await Promise.all(updates);
            console.log(`✅ ${count} services updated successfully.`);
        }

    } catch (error) {
        console.error('❌ Error updating services:', error);
        console.log('Make sure environment variables for Firebase credentials are set.');
    }

    process.exit();
}

updateServices();
