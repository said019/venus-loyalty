/**
 * Capa de compatibilidad Firebase -> Prisma
 * Este archivo proporciona una interfaz similar a Firestore para facilitar la migración
 */

import { prisma } from './index.js';
import crypto from 'crypto';

// Mapeo de colecciones a modelos de Prisma
const collectionMap = {
  'cards': 'card',
  'services': 'service',
  'appointments': 'appointment',
  'events': 'event',
  'products': 'product',
  'expenses': 'expense',
  'giftcards': 'giftCard',
  'notifications': 'notification',
  'booking_requests': 'bookingRequest',
  'settings': 'setting',
  'sales': 'sale',
  'admins': 'admin',
  'admin_resets': 'adminReset',
  'apple_devices': 'appleDevice',
  'apple_updates': 'appleUpdate',
  'google_devices': 'googleDevice',
};

// Clase que simula un documento de Firestore
class DocSnapshot {
  constructor(id, data) {
    this.id = id;
    this._data = data;
    this.exists = data !== null;
  }

  data() {
    return this._data;
  }
}

// Clase que simula una referencia a documento
class DocRef {
  constructor(collectionName, id) {
    this.collectionName = collectionName;
    this.modelName = collectionMap[collectionName];
    this.id = id;
  }

  async get() {
    try {
      const data = await prisma[this.modelName].findUnique({
        where: { id: this.id }
      });
      return new DocSnapshot(this.id, data);
    } catch (error) {
      console.error(`Error getting doc ${this.collectionName}/${this.id}:`, error);
      return new DocSnapshot(this.id, null);
    }
  }

  async set(data, options = {}) {
    try {
      if (options.merge) {
        return await prisma[this.modelName].upsert({
          where: { id: this.id },
          update: data,
          create: { id: this.id, ...data }
        });
      }
      return await prisma[this.modelName].upsert({
        where: { id: this.id },
        update: data,
        create: { id: this.id, ...data }
      });
    } catch (error) {
      console.error(`Error setting doc ${this.collectionName}/${this.id}:`, error);
      throw error;
    }
  }

  async update(data) {
    try {
      // Convertir campos de fecha si es necesario
      const processedData = processDataForUpdate(this.modelName, data);
      
      return await prisma[this.modelName].update({
        where: { id: this.id },
        data: processedData
      });
    } catch (error) {
      console.error(`Error updating doc ${this.collectionName}/${this.id}:`, error);
      throw error;
    }
  }

  async delete() {
    try {
      return await prisma[this.modelName].delete({
        where: { id: this.id }
      });
    } catch (error) {
      console.error(`Error deleting doc ${this.collectionName}/${this.id}:`, error);
      throw error;
    }
  }
}

// Procesar datos para update (convertir fechas, etc.)
function processDataForUpdate(modelName, data) {
  const processed = { ...data };
  
  // Campos que son DateTime en Prisma
  const dateFields = ['createdAt', 'updatedAt', 'lastVisit', 'startDateTime', 'endDateTime', 
                      'confirmedAt', 'cancelledAt', 'sent24hAt', 'sent2hAt', 'expiresAt', 'usedAt', 'timestamp'];
  
  for (const field of dateFields) {
    if (processed[field] && typeof processed[field] === 'string') {
      processed[field] = new Date(processed[field]);
    }
  }
  
  return processed;
}

// Clase que simula una query de Firestore
class Query {
  constructor(collectionName) {
    this.collectionName = collectionName;
    this.modelName = collectionMap[collectionName];
    this._where = {};
    this._orderBy = [];
    this._limit = undefined;
  }

  where(field, op, value) {
    const newQuery = this._clone();
    
    // Convertir operadores de Firestore a Prisma
    if (op === '==') {
      newQuery._where[field] = value;
    } else if (op === '!=') {
      newQuery._where[field] = { not: value };
    } else if (op === '>') {
      newQuery._where[field] = { gt: value };
    } else if (op === '>=') {
      newQuery._where[field] = { gte: value };
    } else if (op === '<') {
      newQuery._where[field] = { lt: value };
    } else if (op === '<=') {
      newQuery._where[field] = { lte: value };
    } else if (op === 'in') {
      newQuery._where[field] = { in: value };
    } else if (op === 'array-contains') {
      // Para JSON arrays, esto es más complejo
      newQuery._where[field] = { has: value };
    }
    
    return newQuery;
  }

  orderBy(field, direction = 'asc') {
    const newQuery = this._clone();
    newQuery._orderBy.push({ [field]: direction });
    return newQuery;
  }

  limit(n) {
    const newQuery = this._clone();
    newQuery._limit = n;
    return newQuery;
  }

  _clone() {
    const newQuery = new Query(this.collectionName);
    newQuery._where = { ...this._where };
    newQuery._orderBy = [...this._orderBy];
    newQuery._limit = this._limit;
    return newQuery;
  }

  async get() {
    try {
      const results = await prisma[this.modelName].findMany({
        where: Object.keys(this._where).length > 0 ? this._where : undefined,
        orderBy: this._orderBy.length > 0 ? this._orderBy : undefined,
        take: this._limit,
      });

      return {
        docs: results.map(r => new DocSnapshot(r.id, r)),
        empty: results.length === 0,
        size: results.length,
        forEach: (callback) => results.forEach((r, i) => callback(new DocSnapshot(r.id, r), i)),
      };
    } catch (error) {
      console.error(`Error querying ${this.collectionName}:`, error);
      return { docs: [], empty: true, size: 0, forEach: () => {} };
    }
  }
}

// Clase que simula una colección de Firestore
class CollectionRef extends Query {
  constructor(collectionName) {
    super(collectionName);
  }

  doc(id) {
    if (!id) {
      // Generar ID único si no se proporciona
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return new DocRef(this.collectionName, id);
  }

  async add(data) {
    try {
      const processedData = processDataForUpdate(this.modelName, data);
      const result = await prisma[this.modelName].create({
        data: processedData
      });
      return new DocRef(this.collectionName, result.id);
    } catch (error) {
      console.error(`Error adding to ${this.collectionName}:`, error);
      throw error;
    }
  }
}

// Objeto principal que simula firestore
export const db = {
  collection(name) {
    return new CollectionRef(name);
  }
};

// Alias para compatibilidad
export const firestore = db;

export default db;
