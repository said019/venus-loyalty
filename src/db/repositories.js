/**
 * Repositorios de base de datos - Reemplazo de Firebase
 */

import { prisma } from './index.js';

// ==================== ADMINS ====================
export const AdminsRepo = {
  async findById(id) {
    return prisma.admin.findUnique({ where: { id } });
  },

  async findByEmail(email) {
    return prisma.admin.findUnique({ where: { email } });
  },

  async create(data) {
    return prisma.admin.create({ data });
  },

  async updatePassword(id, pass_hash) {
    return prisma.admin.update({
      where: { id },
      data: { pass_hash, updatedAt: new Date() }
    });
  },

  async count() {
    return prisma.admin.count();
  }
};

// ==================== ADMIN RESETS ====================
export const AdminResetsRepo = {
  async findByToken(token) {
    return prisma.adminReset.findUnique({ where: { token } });
  },

  async create(data) {
    return prisma.adminReset.create({ data });
  },

  async delete(token) {
    return prisma.adminReset.delete({ where: { token } });
  },

  async deleteExpired() {
    return prisma.adminReset.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
  }
};

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
  },

  // Obtener métricas generales
  async getMetrics() {
    const total = await prisma.card.count();
    const active = await prisma.card.count({ where: { status: 'active' } });
    
    // Tarjetas llenas (para métricas legacy)
    // En Prisma esto es más complejo sin raw SQL si la lógica depende de max dinámico
    // Aproximación: stamps >= 8
    const full = await prisma.card.count({
      where: { stamps: { gte: 8 } }
    });

    return { total, active, full };
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
    // Limpiar y validar datos antes de crear
    const cleanData = {
      name: data.name,
      durationMinutes: parseInt(data.durationMinutes) || 60,
      price: parseFloat(data.price) || 0,
      category: data.category || null,
      description: Array.isArray(data.description) ? data.description.join(', ') : (data.description || null),
      discount: data.discount || null,
      isActive: data.isActive !== undefined ? data.isActive : true,
    };
    return prisma.service.create({ data: cleanData });
  },

  async update(id, data) {
    // Limpiar y validar datos antes de actualizar
    const cleanData = {};
    if (data.name !== undefined) cleanData.name = data.name;
    if (data.durationMinutes !== undefined) cleanData.durationMinutes = parseInt(data.durationMinutes) || 60;
    if (data.price !== undefined) cleanData.price = parseFloat(data.price) || 0;
    if (data.category !== undefined) cleanData.category = data.category || null;
    if (data.description !== undefined) {
      cleanData.description = Array.isArray(data.description) ? data.description.join(', ') : (data.description || null);
    }
    if (data.discount !== undefined) cleanData.discount = data.discount || null;
    if (data.isActive !== undefined) cleanData.isActive = data.isActive;
    cleanData.updatedAt = new Date();

    return prisma.service.update({
      where: { id },
      data: cleanData
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
    // Si son fechas simples (YYYY-MM-DD sin hora), usar el campo `date` (string)
    // para evitar problemas de timezone UTC vs México
    if (!from.includes('T') && !to.includes('T')) {
      return prisma.appointment.findMany({
        where: {
          date: { gte: from, lte: to }
        },
        orderBy: { startDateTime: 'asc' }
      });
    }

    // Si traen hora/timezone (ISO), usar startDateTime como antes
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
  },

  async getMetrics(startDate) {
    const where = startDate ? { createdAt: { gte: startDate } } : undefined;
    const events = await prisma.event.findMany({ where });
    
    const counts = { stamp: 0, redeem: 0 };
    events.forEach(e => {
      const type = (e.type || '').toLowerCase();
      if (type === 'stamp') counts.stamp++;
      if (type === 'redeem') counts.redeem++;
    });
    
    return counts;
  },
  
  async getLastStampDate(cardId) {
    const last = await prisma.event.findFirst({
      where: { 
        cardId,
        type: 'stamp' // asumiendo lowercase
      },
      orderBy: { createdAt: 'desc' }
    });
    return last ? last.createdAt : null;
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
    // Normalizar datos para compatibilidad con diferentes versiones del schema
    const saleData = {
      appointmentId: data.appointmentId || null,
      clientName: data.clientName || null,
      clientPhone: data.clientPhone || null,
      serviceName: data.serviceName || null,
      products: data.productsSold || data.products || null,
      subtotal: data.subtotal || 0,
      discount: data.discountAmount || data.discount || 0,
      total: data.totalAmount || data.total || 0,
      paymentMethod: data.paymentMethod,
      date: data.date || new Date()
    };

    try {
      // Intentar con todos los campos nuevos
      return await prisma.sale.create({
        data: {
          ...saleData,
          serviceAmount: data.serviceAmount || null,
          productsAmount: data.productsAmount || null,
          productsSold: data.productsSold || null,
          discountType: data.discountType || null,
          discountValue: data.discountValue || null,
          discountAmount: data.discountAmount || null,
          totalAmount: data.totalAmount || null
        }
      });
    } catch (error) {
      // Si falla por campos desconocidos, usar solo los campos básicos
      console.warn('[SalesRepo] Usando schema básico:', error.message);
      return await prisma.sale.create({ data: saleData });
    }
  }
};

// ==================== BLOCKED SLOTS ====================
export const BlockedSlotsRepo = {
  async findAll() {
    return prisma.blockedSlot.findMany({
      orderBy: { createdAt: 'desc' }
    });
  },

  async create(data) {
    return prisma.blockedSlot.create({ data });
  },

  async delete(id) {
    return prisma.blockedSlot.delete({ where: { id } });
  }
};

// ==================== GOOGLE DEVICES ====================
export const GoogleDevicesRepo = {
  async register(cardId, deviceId) {
    const id = `google_${cardId}_${deviceId}`;
    // Upsert para manejar duplicados
    return prisma.googleDevice.upsert({
      where: { id },
      create: {
        id,
        cardId,
        objectId: deviceId, // Mapeo a objectId por ahora
        createdAt: new Date()
      },
      update: {
        // Nada que actualizar realmente, solo confirmar que existe
      }
    });
  },

  async findByCardId(cardId) {
    return prisma.googleDevice.findMany({
      where: { cardId }
    });
  }
};


// ==================== APPLE DEVICES ====================
export const AppleDevicesRepo = {
  async register(data) {
    // unique constraint en schema: [deviceId, passTypeId, serialNumber]
    return prisma.appleDevice.create({ data });
  },
  
  async findByDevice(deviceId) {
    return prisma.appleDevice.findMany({
      where: { deviceId }
    });
  },
  
  async findBySerial(serialNumber) {
    return prisma.appleDevice.findMany({
      where: { serialNumber }
    });
  },
  
  async delete(deviceId, serialNumber) {
    // Prisma delete requiere ID único o unique constraint completo
    // Buscamos primero para obtener el ID
    const device = await prisma.appleDevice.findFirst({
      where: { deviceId, serialNumber }
    });
    
    if (device) {
      return prisma.appleDevice.delete({
        where: { id: device.id }
      });
    }
    return null;
  }
};

// ==================== APPLE UPDATES ====================
export const AppleUpdatesRepo = {
  async create(serialNumber) {
    return prisma.appleUpdate.create({
      data: {
        serialNumber,
        updatedAt: new Date()
      }
    });
  },
  
  async findSince(serialNumber, since) {
    // Encontrar actualizaciones posteriores a 'since'
    // El protocolo Apple pide devolver el lastUpdated tag
    // Esta lógica es específica, aquí solo devolvemos registros
    return prisma.appleUpdate.findMany({
      where: {
        serialNumber,
        updatedAt: { gt: since }
      }
    });
  }
};

// ==================== LEADS (Mini-CRM) ====================
export const LeadsRepo = {
  async findById(id) {
    return prisma.lead.findUnique({ where: { id } });
  },

  async findByMarketer(marketerId, options = {}) {
    const { status, orderBy = { createdAt: 'desc' } } = options;
    return prisma.lead.findMany({
      where: {
        marketerId,
        ...(status ? { status } : {}),
      },
      orderBy,
    });
  },

  async create(data) {
    return prisma.lead.create({ data });
  },

  async update(id, data) {
    return prisma.lead.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  },

  async updateStatus(id, status, extra = {}) {
    const updateData = { status, ...extra, updatedAt: new Date() };
    if (status === 'contactado') updateData.contactedAt = new Date();
    if (status === 'convertido') updateData.convertedAt = new Date();
    return prisma.lead.update({ where: { id }, data: updateData });
  },

  async convert(id, appointmentId) {
    return prisma.lead.update({
      where: { id },
      data: {
        status: 'convertido',
        appointmentId,
        convertedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  },

  async delete(id) {
    return prisma.lead.delete({ where: { id } });
  },

  // Lead scoring: computa score 0-100 basado en señales
  async computeScore(lead) {
    let score = 0;
    if (lead.isNewClient) score += 30;
    if (lead.origin === 'referido') score += 20;
    if (lead.clientBirthday) score += 15;
    if (lead.serviceId) {
      const service = await prisma.service.findUnique({ where: { id: lead.serviceId } });
      if (service && parseFloat(service.price) >= 500) score += 10;
    }
    // Check WhatsApp activity within 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const msgs = await prisma.whatsappMessage.findFirst({
      where: { phone: lead.phone, direction: 'in', timestamp: { gte: since } },
    });
    if (msgs) score += 20;
    // Penalizar ad fría sin follow-up
    if (['facebook-ads', 'instagram-ads'].includes(lead.origin) && !msgs) score -= 25;
    return Math.max(0, Math.min(100, score));
  },
};

// ==================== COMMISSIONS ====================
export const CommissionsRepo = {
  async findById(id) {
    return prisma.commission.findUnique({ where: { id } });
  },

  async create(data) {
    return prisma.commission.create({ data });
  },

  async findByAppointment(appointmentId) {
    return prisma.commission.findUnique({ where: { appointmentId } });
  },

  async findByMarketer(marketerId, options = {}) {
    const { status, fromDate, toDate } = options;
    const where = { marketerId };
    if (status) where.status = status;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }
    return prisma.commission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  },

  async findAll(options = {}) {
    const { status, marketerId, fromDate, toDate } = options;
    const where = {};
    if (status) where.status = status;
    if (marketerId) where.marketerId = marketerId;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }
    return prisma.commission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  },

  async markPaid(id) {
    return prisma.commission.update({
      where: { id },
      data: { status: 'pagada', paidAt: new Date() },
    });
  },

  async cancelByAppointment(appointmentId) {
    const existing = await prisma.commission.findUnique({ where: { appointmentId } });
    if (!existing) return null;
    return prisma.commission.update({
      where: { appointmentId },
      data: { status: 'cancelada' },
    });
  },

  async totalsByMarketer(marketerId) {
    const commissions = await prisma.commission.findMany({
      where: { marketerId },
    });
    const pendiente = commissions
      .filter(c => c.status === 'pendiente')
      .reduce((sum, c) => sum + c.amount, 0);
    const pagada = commissions
      .filter(c => c.status === 'pagada')
      .reduce((sum, c) => sum + c.amount, 0);
    const cancelada = commissions
      .filter(c => c.status === 'cancelada')
      .reduce((sum, c) => sum + c.amount, 0);
    return { pendiente, pagada, cancelada, total: commissions.length };
  },
};

// ==================== REFERRALS ====================
export const ReferralsRepo = {
  async findById(id) {
    return prisma.referral.findUnique({ where: { id } });
  },

  async create(data) {
    return prisma.referral.create({ data });
  },

  async findByReferrer(referrerCardId) {
    return prisma.referral.findMany({
      where: { referrerCardId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findByInvitee(inviteeCardId) {
    return prisma.referral.findUnique({ where: { inviteeCardId } });
  },

  async findPending() {
    return prisma.referral.findMany({
      where: { status: 'pendiente' },
    });
  },

  async markCompleted(id) {
    return prisma.referral.update({
      where: { id },
      data: { status: 'completada', completedAt: new Date() },
    });
  },

  async markAwarded(id) {
    return prisma.referral.update({
      where: { id },
      data: { status: 'pagada', awardedAt: new Date() },
    });
  },

  async checkCap(referrerCardId, cap = 5) {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const count = await prisma.referral.count({
      where: {
        referrerCardId,
        status: { in: ['completada', 'pagada'] },
        completedAt: { gte: yearStart },
      },
    });
    return count < cap;
  },
};

// ==================== CHALLENGES (Retos de sellos) ====================
export const ChallengesRepo = {
  async findById(id) {
    return prisma.challenge.findUnique({ where: { id } });
  },

  async findByCard(cardId, options = {}) {
    const { activeOnly = false } = options;
    const where = { cardId };
    if (activeOnly) where.completedAt = null;
    return prisma.challenge.findMany({
      where,
      orderBy: { startedAt: 'desc' },
    });
  },

  async create(data) {
    return prisma.challenge.create({ data });
  },

  async incrementProgress(id) {
    const challenge = await prisma.challenge.findUnique({ where: { id } });
    if (!challenge) return null;
    const visitsCompleted = challenge.visitsCompleted + 1;
    const isComplete = visitsCompleted >= challenge.targetVisits;
    return prisma.challenge.update({
      where: { id },
      data: {
        visitsCompleted,
        completedAt: isComplete ? new Date() : null,
      },
    });
  },

  async findActive() {
    return prisma.challenge.findMany({
      where: { completedAt: null },
    });
  },

  // Evaluar ventanas de retos: si startedAt + windowDays < now, marcar expirado
  async evaluateWindows() {
    const now = new Date();
    const active = await prisma.challenge.findMany({
      where: { completedAt: null },
    });
    const expired = [];
    for (const ch of active) {
      const deadline = new Date(ch.startedAt.getTime() + ch.windowDays * 24 * 60 * 60 * 1000);
      if (deadline < now && ch.visitsCompleted < ch.targetVisits) {
        await prisma.challenge.update({
          where: { id: ch.id },
          data: { completedAt: now },
        });
        expired.push(ch);
      }
    }
    return expired;
  },
};

// ==================== PROMOTIONS ====================
export const PromotionsRepo = {
  async findById(id) {
    return prisma.promotion.findUnique({ where: { id } });
  },

  async findActive() {
    const now = new Date();
    return prisma.promotion.findMany({
      where: {
        active: true,
        OR: [
          { endsAt: null },
          { endsAt: { gte: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findByType(type) {
    return prisma.promotion.findMany({
      where: { type, active: true },
    });
  },

  async findAll() {
    return prisma.promotion.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(data) {
    return prisma.promotion.create({ data });
  },

  async update(id, data) {
    return prisma.promotion.update({ where: { id }, data });
  },

  async deactivate(id) {
    return prisma.promotion.update({
      where: { id },
      data: { active: false },
    });
  },
};

// ==================== TOUCHPOINTS (Atribución multi-touch) ====================
export const TouchpointsRepo = {
  async findById(id) {
    return prisma.touchpoint.findUnique({ where: { id } });
  },

  async findByCard(cardId) {
    return prisma.touchpoint.findMany({
      where: { cardId },
      orderBy: { timestamp: 'asc' },
    });
  },

  async create(data) {
    return prisma.touchpoint.create({ data });
  },

  // Reporte de atribución: first-touch vs last-touch por canal
  async attributionReport(fromDate, toDate) {
    const touchpoints = await prisma.touchpoint.findMany({
      where: {
        timestamp: {
          gte: new Date(fromDate),
          lte: new Date(toDate),
        },
      },
      include: { card: { select: { id: true, phone: true } } },
      orderBy: { timestamp: 'asc' },
    });

    // Agrupar por cardId: first-touch y last-touch
    const byCard = {};
    for (const tp of touchpoints) {
      if (!tp.cardId) continue;
      if (!byCard[tp.cardId]) byCard[tp.cardId] = [];
      byCard[tp.cardId].push(tp);
    }

    const firstTouch = {};
    const lastTouch = {};
    for (const [cardId, tps] of Object.entries(byCard)) {
      firstTouch[cardId] = tps[0].channel;
      lastTouch[cardId] = tps[tps.length - 1].channel;
    }

    // Contar por canal
    const firstCounts = {};
    const lastCounts = {};
    for (const ch of Object.values(firstTouch)) {
      firstCounts[ch] = (firstCounts[ch] || 0) + 1;
    }
    for (const ch of Object.values(lastTouch)) {
      lastCounts[ch] = (lastCounts[ch] || 0) + 1;
    }

    return { firstTouch: firstCounts, lastTouch: lastCounts, totalCards: Object.keys(byCard).length };
  },
};

// ==================== CARDS — Extensiones de marketing ====================
export const CardsMarketingRepo = {
  async findByReferralCode(code) {
    return prisma.card.findUnique({ where: { referralCode: code } });
  },

  async findByInactive(days) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return prisma.card.findMany({
      where: {
        status: 'active',
        OR: [
          { lastVisit: { lt: cutoff } },
          { lastVisit: null },
        ],
      },
      orderBy: { lastVisit: 'asc' },
    });
  },

  async findByBirthdayMonth(month) {
    const cards = await prisma.card.findMany({ where: { status: 'active' } });
    return cards.filter(c => {
      if (!c.birthday) return false;
      const [, m] = c.birthday.split('-');
      return parseInt(m) === month;
    });
  },

  async findByCardType(cardType) {
    return prisma.card.findMany({
      where: { cardType, status: 'active' },
      orderBy: { cycles: 'desc' },
    });
  },

  async findAmbassadors() {
    return prisma.card.findMany({
      where: { isAmbassador: true },
      orderBy: { cycles: 'desc' },
    });
  },

  async promoteToGold(cardId) {
    return prisma.card.update({
      where: { id: cardId },
      data: { cardType: 'gold', updatedAt: new Date() },
    });
  },

  async setAmbassador(cardId, isAmbassador) {
    return prisma.card.update({
      where: { id: cardId },
      data: { isAmbassador, updatedAt: new Date() },
    });
  },

  async generateReferralCode(cardId) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return null;
    if (card.referralCode) return card.referralCode;
    // Generar código: primeras 4 letras del nombre (sin espacios) + últimos 2 dígitos del phone
    const namePart = (card.name || 'VENUS').replace(/\s/g, '').toUpperCase().slice(0, 4);
    const phonePart = (card.phone || '00').slice(-2);
    const code = `${namePart}${phonePart}`;
    // Verificar unicidad, si existe agregar número
    let finalCode = code;
    let exists = await prisma.card.findUnique({ where: { referralCode: finalCode } });
    let n = 1;
    while (exists && exists.id !== cardId) {
      finalCode = `${code}${n}`;
      exists = await prisma.card.findUnique({ where: { referralCode: finalCode } });
      n++;
    }
    return prisma.card.update({
      where: { id: cardId },
      data: { referralCode: finalCode, updatedAt: new Date() },
    });
  },

  async setPublicDisplayOk(cardId, ok) {
    return prisma.card.update({
      where: { id: cardId },
      data: { publicDisplayOk: ok, updatedAt: new Date() },
    });
  },
};

export default {
  admins: AdminsRepo,
  adminResets: AdminResetsRepo,
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
  blockedSlots: BlockedSlotsRepo,
  googleDevices: GoogleDevicesRepo,
  appleDevices: AppleDevicesRepo,
  appleUpdates: AppleUpdatesRepo,
  leads: LeadsRepo,
  commissions: CommissionsRepo,
  referrals: ReferralsRepo,
  challenges: ChallengesRepo,
  promotions: PromotionsRepo,
  touchpoints: TouchpointsRepo,
  cardsMarketing: CardsMarketingRepo,
};
