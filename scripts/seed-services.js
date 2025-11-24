import { ServiceModel } from '../src/models/index.js';

const services = [
    { name: "Depilación (Facial)", price: 350, durationMinutes: 40, category: "Facial", active: true },
    { name: "HiFU Abdomen", price: 1500, durationMinutes: 60, category: "Facial", active: true },
    { name: "Depilacion (Depilación)", price: 350, durationMinutes: 30, category: "Depilación", active: true },
    { name: "PQT Despigmentante", price: 400, durationMinutes: 30, category: "Facial", active: true },
    { name: "Facial Anti-edad", price: 500, durationMinutes: 60, category: "Facial", active: true },
    { name: "Masaje Reafirmante", price: 1000, durationMinutes: 60, category: "Facial", active: true },
    { name: "Drenaje Linfático", price: 650, durationMinutes: 60, category: "Masajes", active: true },
    { name: "Facial Colágeno", price: 700, durationMinutes: 60, category: "Facial", active: true },
    { name: "Limpieza profunda", price: 700, durationMinutes: 60, category: "Facial", active: true },
    { name: "Depilacion (General)", price: 580, durationMinutes: 60, category: "Depilación", active: true }
];

async function seed() {
    console.log('🌱 Seeding services...');
    for (const s of services) {
        await ServiceModel.upsert(s);
    }
    console.log('✅ Services seeded!');
}

seed();
