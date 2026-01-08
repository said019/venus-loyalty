/**
 * Repositorios de base de datos - Reemplazo de Firebase
 */

import { prisma } from './index.js';

// ==================== CARDS ====================
export const CardsRepo = {
  async findById(id) {
    return prisma.card.findUnique({ where: { id } });
  },

  async findByPhone(phone) {
    // Normalizar teléfono igual que en create: agregar prefijo 52 si son 10 dígitos
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;

    // Intentar buscar con el teléfono normalizado
    let card = await prisma.card.findUnique({ where: { phone: cleanPhone } });

    // Si no se encuentra y tiene prefijo 52, intentar sin él
    if (!card && cleanPhone.startsWith('52') && cleanPhone.length === 12) {
      const phoneWithout52 = cleanPhone.substring(2);
      card = await prisma.card.findUnique({ where: { phone: phoneWithout52 } });
    }

    return card;
  },

  async findAll(options = {}) {
    const { status, orderBy = { createdAt: 'desc' }, take, skip } = options;
    return prisma.card.findMany({
      where: status ? { status } : undefined,
      orderBy,
      take,
      skip,
    });
  },

  async create(data) {
    // Normalizar teléfono: agregar prefijo 52 si son 10 dígitos
    let cleanPhone = data.phone?.replace(/\D/g, '') || '';
    if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;

    return prisma.card.create({
      data: {
        ...data,
        phone: cleanPhone,
      }
    });
  },

  async update(id, data) {
    return prisma.card.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      }
    });
  },

  async delete(id) {
    return prisma.card.delete({ where: { id } });
  },

  async addStamp(id) {
    const card = await prisma.card.findUnique({ where: { id } });
    if (!card) throw new Error('Card not found');

    const newStamps = card.stamps + 1;
    const shouldRedeem = newStamps >= card.max;

    return prisma.card.update({
      where: { id },
      data: {
        stamps: shouldRedeem ? 0 : newStamps,
        cycles: shouldRedeem ? card.cycles + 1 : card.cycles,
        lastVisit: new Date(),
        updatedAt: new Date(),
      }
    });
  },

  async redeem(id) {
    return prisma.card.update({
      where: { id },
      data: {
        stamps: 0,
        cycles: { increment: 1 },
        lastVisit: new Date(),
        updatedAt: new Date(),
      }
    });
  },

  async search(query) {
    return prisma.card.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query } },
        ]
      },
      orderBy: { name: 'asc' },
      take: 20,
    });
  },

  async findByBirthday(month, day) {
    // Buscar tarjetas cuyo cumpleaños coincida con mes y día
    const cards = await prisma.card.findMany({
      where: { status: 'active' }
    });
    
    return cards.filter(card => {
      if (!card.birthday) return false;
      const [, m, d] = card.birthday.split('-');
      return parseInt(m) === month && parseInt(d) === day;
    });
  }
};

// ==================== SERVICES ====================
export const ServicesRepo = {
  async findById(id) {
    return prisma.service.findUnique({ where: { id } });
  },

  async findAll(options = {}) {
    const { isActive, orderBy = { name: 'asc' } } = options;
    return prisma.service.findMany({
      where: isActive !== undefined ? { isActive } : undefined,
      orderBy,
    });
  },

  async create(data) {
    return prisma.service.create({ data });
  },

  async update(id, data) {
    return prisma.service.update({
      where: { id },
      data: { ...data, updatedAt: new Date() }
    });
  },

  async delete(id) {
    return prisma.service.delete({ where: { id } });
  }
};

// ==================== APPOINTMENTS ====================
export const AppointmentsRepo = {
  async findById(id) {
    return prisma.appointment.findUnique({
      where: { id },
      include: { card: true }
    });
  },

  async findByDate(date) {
    return prisma.appointment.findMany({
      where: { date },
      orderBy: { startDateTime: 'asc' }
    });
  },

  async findByDateRange(from, to) {
    return prisma.appointment.findMany({
      where: {
        startDateTime: {
          gte: new Date(from),
          lte: new Date(to),
        }
      },
      orderBy: { startDateTime: 'asc' }
    });
  },

  async findByPhone(phone, options = {}) {
    const cleanPhone = phone.replace(/\D/g, '');
    return prisma.appointment.findMany({
      where: {
        clientPhone: { endsWith: cleanPhone.slice(-10) },
        ...(options.status && { status: { in: options.status } }),
        ...(options.fromDate && { startDateTime: { gte: new Date(options.fromDate) } }),
      },
      orderBy: { startDateTime: 'asc' }
    });
  },

  async findConflicts(date, time, duration, excludeId = null) {
    // Crear fechas en timezone de México (UTC-6)
    const startDateTime = new Date(`${date}T${time}:00-06:00`);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    return prisma.appointment.findMany({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        status: { in: ['scheduled', 'confirmed'] },
        OR: [
          {
            AND: [
              { startDateTime: { lt: endDateTime } },
              { endDateTime: { gt: startDateTime } }
            ]
          }
        ]
      }
    });
  },

  async create(data) {
    // Crear fechas en timezone de México (UTC-6)
    const startDateTime = new Date(`${data.date}T${data.time}:00-06:00`);
    const duration = data.durationMinutes || 60;
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    return prisma.appointment.create({
      data: {
        ...data,
        startDateTime,
        endDateTime,
        durationMinutes: duration,
      }
    });
  },

  async update(id, data) {
    // Si se actualiza fecha/hora, recalcular startDateTime y endDateTime
    if (data.date && data.time) {
      // Crear fechas en timezone de México (UTC-6)
      const startDateTime = new Date(`${data.date}T${data.time}:00-06:00`);
      const duration = data.durationMinutes || 60;
      const endDateTime = new Date(startDateTime.getTime() + duration * 60000);
      data.startDateTime = startDateTime;
      data.endDateTime = endDateTime;
    }

    return prisma.appointment.update({
      where: { id },
      data: { ...data, updatedAt: new Date() }
    });
  },

  async cancel(id, reason = null) {
    return prisma.appointment.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: reason,
        updatedAt: new Date(),
      }
    });
  },

  async complete(id, paymentData) {
    return prisma.appointment.update({
      where: { id },
      data: {
        status: 'completed',
        totalPaid: paymentData.total,
        paymentMethod: paymentData.method,
        discount: paymentData.discount || null,
        productsSold: paymentData.products || null,
        updatedAt: new Date(),
      }
    });
  },

  async confirm(id) {
    return prisma.appointment.update({
      where: { id },
      data: {
        status: 'confirmed',
        confirmedAt: new Date(),
        updatedAt: new Date(),
      }
    });
  },

  async delete(id) {
    return prisma.appointment.delete({ where: { id } });
  }
};

// ==================== EVENTS ====================
export const EventsRepo = {
  async findByCardId(cardId) {
    return prisma.event.findMany({
      where: { cardId },
      orderBy: { timestamp: 'desc' }
    });
  },

  async create(data) {
    return prisma.event.create({ data });
  },

  async findRecent(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return prisma.event.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' }
    });
  }
};

// ==================== PRODUCTS ====================
export const ProductsRepo = {
  async findById(id) {
    return prisma.product.findUnique({ where: { id } });
  },

  async findAll(options = {}) {
    const { orderBy = { name: 'asc' } } = options;
    return prisma.product.findMany({ orderBy });
  },

  async create(data) {
    return prisma.product.create({ data });
  },

  async update(id, data) {
    return prisma.product.update({
      where: { id },
      data: { ...data, updatedAt: new Date() }
    });
  },

  async delete(id) {
    return prisma.product.delete({ where: { id } });
  },

  async updateStock(id, change) {
    return prisma.product.update({
      where: { id },
      data: {
        stock: { increment: change },
        updatedAt: new Date(),
      }
    });
  },

  async findLowStock() {
    const products = await prisma.product.findMany();
    return products.filter(p => p.stock <= p.minStock);
  }
};

// ==================== EXPENSES ====================
export const ExpensesRepo = {
  async findById(id) {
    return prisma.expense.findUnique({ where: { id } });
  },

  async findByDateRange(from, to) {
    return prisma.expense.findMany({
      where: {
        date: { gte: from, lte: to }
      },
      orderBy: { date: 'desc' }
    });
  },

  async create(data) {
    return prisma.expense.create({ data });
  },

  async update(id, data) {
    return prisma.expense.update({
      where: { id },
      data: { ...data, updatedAt: new Date() }
    });
  },

  async delete(id) {
    return prisma.expense.delete({ where: { id } });
  }
};

// ==================== GIFT CARDS ====================
export const GiftCardsRepo = {
  async findById(id) {
    return prisma.giftCard.findUnique({ where: { id } });
  },

  async findByCode(code) {
    return prisma.giftCard.findUnique({ where: { code } });
  },

  async findAll(options = {}) {
    const { status, orderBy = { createdAt: 'desc' } } = options;
    return prisma.giftCard.findMany({
      where: status ? { status } : undefined,
      orderBy,
    });
  },

  async create(data) {
    return prisma.giftCard.create({ data });
  },

  async update(id, data) {
    return prisma.giftCard.update({
      where: { id },
      data: { ...data, updatedAt: new Date() }
    });
  },

  async use(id, amount) {
    const card = await prisma.giftCard.findUnique({ where: { id } });
    if (!card) throw new Error('Gift card not found');

    const newRemaining = Number(card.remainingAmount) - amount;
    
    return prisma.giftCard.update({
      where: { id },
      data: {
        remainingAmount: newRemaining,
        status: newRemaining <= 0 ? 'used' : 'active',
        usedAt: newRemaining <= 0 ? new Date() : null,
        updatedAt: new Date(),
      }
    });
  },

  async findExpiringSoon(days = 7) {
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return prisma.giftCard.findMany({
      where: {
        status: 'pending',
        expiresAt: { lte: futureDate }
      }
    });
  }
};

// ==================== NOTIFICATIONS ====================
export const NotificationsRepo = {
  async findAll(options = {}) {
    const { read, take = 50, orderBy = { createdAt: 'desc' } } = options;
    return prisma.notification.findMany({
      where: read !== undefined ? { read } : undefined,
      orderBy,
      take,
    });
  },

  async create(data) {
    // Si viene entityId, guardarlo en el campo data como JSON para compatibilidad
    const { entityId, ...rest } = data;
    const notificationData = {
      ...rest,
      entityId: entityId || null,
      data: entityId ? { entityId } : null
    };
    
    try {
      return await prisma.notification.create({ data: notificationData });
    } catch (error) {
      // Si falla por entityId (campo no existe en la BD), intentar sin él
      if (error.message.includes('entityId')) {
        console.warn('[NotificationsRepo] Campo entityId no existe, guardando en data JSON');
        const { entityId: _, ...safeData } = notificationData;
        safeData.data = entityId ? { entityId } : null;
        return await prisma.notification.create({ data: safeData });
      }
      throw error;
    }
  },

  async markAsRead(id) {
    return prisma.notification.update({
      where: { id },
      data: { read: true }
    });
  },

  async markAllAsRead() {
    return prisma.notification.updateMany({
      where: { read: false },
      data: { read: true }
    });
  },

  async delete(id) {
    return prisma.notification.delete({ where: { id } });
  },

  async deleteOld(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } }
    });
  }
};

// ==================== BOOKING REQUESTS ====================
export const BookingRequestsRepo = {
  async findById(id) {
    return prisma.bookingRequest.findUnique({ where: { id } });
  },

  async findAll(options = {}) {
    const { status, orderBy = { createdAt: 'desc' } } = options;
    return prisma.bookingRequest.findMany({
      where: status ? { status } : undefined,
      orderBy,
    });
  },

  async create(data) {
    return prisma.bookingRequest.create({ data });
  },

  async update(id, data) {
    return prisma.bookingRequest.update({
      where: { id },
      data: { ...data, updatedAt: new Date() }
    });
  },

  async delete(id) {
    return prisma.bookingRequest.delete({ where: { id } });
  }
};

// ==================== SETTINGS ====================
export const SettingsRepo = {
  async get(key) {
    const setting = await prisma.setting.findUnique({ where: { key } });
    return setting?.value;
  },

  async set(key, value) {
    return prisma.setting.upsert({
      where: { key },
      update: { value, updatedAt: new Date() },
      create: { key, value }
    });
  },

  async delete(key) {
    return prisma.setting.delete({ where: { key } });
  }
};

// ==================== SALES ====================
export const SalesRepo = {
  async findByDateRange(from, to) {
    return prisma.sale.findMany({
      where: {
        date: { gte: new Date(from), lte: new Date(to) }
      },
      orderBy: { date: 'desc' }
    });
  },

  async create(data) {
    return prisma.sale.create({ data });
  }
};

export default {
  cards: CardsRepo,
  services: ServicesRepo,
  appointments: AppointmentsRepo,
  events: EventsRepo,
  products: ProductsRepo,
  expenses: ExpensesRepo,
  giftCards: GiftCardsRepo,
  notifications: NotificationsRepo,
  bookingRequests: BookingRequestsRepo,
  settings: SettingsRepo,
  sales: SalesRepo,
};
