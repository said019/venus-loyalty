/**
 * Capa de compatibilidad Firebase -> Prisma
 * Este archivo proporciona una interfaz similar a Firestore para facilitar la migración
 */

import { prisma } from './index.js';
import crypto from 'crypto';

// Mapeo de colecciones a modelos de Prisma
const collectionMap = {
  'cards': 'card',
  'clients': 'card', // Alias - algunos módulos usan 'clients' en lugar de 'cards'
  'services': 'service',
  'appointments': 'appointment',
  'events': 'event',
  'products': 'product',
  'expenses': 'expense',
  'giftcards': 'giftCard',
  'notifications': 'notification',
  'booking_requests': 'bookingRequest',
  'bookingRequests': 'bookingRequest', // Alias camelCase
  'settings': 'setting',
  'sales': 'sale',
  'admins': 'admin',
  'admin_resets': 'adminReset',
  'apple_devices': 'appleDevice',
  'apple_updates': 'appleUpdate',
  'google_devices': 'googleDevice',
  'gift_card_redeems': 'giftCardRedeem',
};

// Mapeo inverso de campos (camelCase a lo que espera el código legacy)
const reverseFieldMap = {
  'isActive': 'active',
  'redeemedAt': 'redeemed_at',
  'clientName': 'client_name',
  'expiryDate': 'expiry_date',
};

// Función para mapear datos de salida (Prisma -> formato legacy)
function mapOutputData(data) {
  if (!data) return data;
  const mapped = { ...data };
  for (const [prismaField, legacyField] of Object.entries(reverseFieldMap)) {
    if (prismaField in mapped) {
      mapped[legacyField] = mapped[prismaField];
      // No eliminamos el campo original para mantener compatibilidad
    }
  }
  return mapped;
}

// Clase que simula un documento de Firestore
class DocSnapshot {
  constructor(id, data) {
    this.id = id;
    this._data = mapOutputData(data);
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
                      'confirmedAt', 'cancelledAt', 'sent24hAt', 'sent2hAt', 'expiresAt', 'usedAt', 
                      'timestamp', 'redeemedAt', 'redeemed_at'];
  
  for (const field of dateFields) {
    if (processed[field] && typeof processed[field] === 'string') {
      processed[field] = new Date(processed[field]);
    }
  }
  
  // Eliminar updatedAt ya que Prisma lo maneja automáticamente con @updatedAt
  if (processed.updatedAt) {
    delete processed.updatedAt;
  }
  
  // Eliminar createdAt si es string (Prisma usa @default(now()))
  if (processed.createdAt && typeof processed.createdAt === 'string') {
    delete processed.createdAt;
  }
  
  // Eliminar campos que no existen en los modelos de Prisma
  delete processed.notes; // Card no tiene campo notes
  delete processed.favoriteServices; // Card no tiene este campo
  delete processed.reminders; // Appointment no tiene este campo (era para Firebase)
  delete processed.cosmetologistEmail; // No existe en el modelo
  delete processed.entityId; // Notification no tiene este campo
  delete processed.clientId; // En Prisma es cardId, no clientId
  
  // Mapear clientId a cardId si existe
  if (data.clientId && !processed.cardId) {
    processed.cardId = data.clientId;
  }
  
  // Mapear campos con nombres diferentes (snake_case a camelCase)
  if (processed.redeemed_at) {
    processed.redeemedAt = processed.redeemed_at instanceof Date ? processed.redeemed_at : new Date(processed.redeemed_at);
    delete processed.redeemed_at;
  }
  if (processed.client_name) {
    processed.clientName = processed.client_name;
    delete processed.client_name;
  }
  if (processed.expiry_date) {
    processed.expiryDate = processed.expiry_date;
    delete processed.expiry_date;
  }
  
  return processed;
}

// Mapeo de campos snake_case a camelCase
const fieldMap = {
  'redeemed_at': 'redeemedAt',
  'client_name': 'clientName',
  'expiry_date': 'expiryDate',
  'active': 'isActive',
};

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
    
    // Mapear nombre de campo si es necesario
    const mappedField = fieldMap[field] || field;
    
    // Campos que son DateTime en Prisma - convertir strings a Date
    const dateTimeFields = ['startDateTime', 'endDateTime', 'createdAt', 'updatedAt', 
                            'lastVisit', 'confirmedAt', 'cancelledAt', 'sent24hAt', 
                            'sent2hAt', 'expiresAt', 'usedAt', 'timestamp', 'redeemedAt'];
    
    let processedValue = value;
    if (dateTimeFields.includes(mappedField) && typeof value === 'string') {
      processedValue = new Date(value);
    }
    
    // Convertir operadores de Firestore a Prisma
    if (op === '==') {
      newQuery._where[mappedField] = processedValue;
    } else if (op === '!=') {
      newQuery._where[mappedField] = { not: processedValue };
    } else if (op === '>') {
      newQuery._where[mappedField] = { gt: processedValue };
    } else if (op === '>=') {
      newQuery._where[mappedField] = { gte: processedValue };
    } else if (op === '<') {
      newQuery._where[mappedField] = { lt: processedValue };
    } else if (op === '<=') {
      newQuery._where[mappedField] = { lte: processedValue };
    } else if (op === 'in') {
      // Para 'in', procesar cada valor si es un campo de fecha
      if (dateTimeFields.includes(mappedField) && Array.isArray(value)) {
        newQuery._where[mappedField] = { in: value.map(v => typeof v === 'string' ? new Date(v) : v) };
      } else {
        newQuery._where[mappedField] = { in: value };
      }
    } else if (op === 'array-contains') {
      // Para JSON arrays, esto es más complejo
      newQuery._where[mappedField] = { has: value };
    }
    
    return newQuery;
  }

  orderBy(field, direction = 'asc') {
    const newQuery = this._clone();
    // Mapear nombre de campo si es necesario
    const mappedField = fieldMap[field] || field;
    newQuery._orderBy.push({ [mappedField]: direction });
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
