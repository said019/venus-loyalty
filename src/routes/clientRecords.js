// src/routes/clientRecords.js
// API para expedientes de clientas
import express from 'express';
import { prisma } from '../db/index.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

const router = express.Router();

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configurar multer para memoria (luego subimos a Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'), false);
    }
  }
});

// Helper para subir a Cloudinary
async function uploadToCloudinary(buffer, folder = 'venus-expedientes') {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 1200, crop: 'limit' },
          { quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
}

// ==================== EXPEDIENTES ====================

// Obtener expediente de una clienta (o crear si no existe)
router.get('/card/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;

    // Verificar que la tarjeta existe
    const card = await prisma.card.findUnique({
      where: { id: cardId }
    });

    if (!card) {
      return res.status(404).json({ success: false, error: 'Tarjeta no encontrada' });
    }

    // Buscar o crear expediente
    let record = await prisma.clientRecord.findUnique({
      where: { cardId },
      include: {
        sessions: {
          orderBy: { date: 'desc' },
          include: {
            photos: true
          }
        },
        photos: {
          orderBy: { takenAt: 'desc' }
        }
      }
    });

    if (!record) {
      record = await prisma.clientRecord.create({
        data: { cardId },
        include: {
          sessions: true,
          photos: true
        }
      });
    }

    // Obtener historial de visitas (stamps) y citas
    const [events, appointments] = await Promise.all([
      prisma.event.findMany({
        where: { cardId },
        orderBy: { timestamp: 'desc' }
      }),
      prisma.appointment.findMany({
        where: {
          OR: [
            { cardId },
            { clientPhone: card.phone }
          ],
          status: { in: ['completed', 'confirmed'] }
        },
        orderBy: { date: 'desc' } // Note: date is string YYYY-MM-DD, so string sort works approx. strictly better to use startDateTime but this is existing pattern
      })
    ]);

    res.json({
      success: true,
      data: {
        ...record,
        client: {
          id: card.id,
          name: card.name,
          phone: card.phone,
          email: card.email,
          birthday: card.birthday
        },
        events,
        appointments
      }
    });
  } catch (error) {
    console.error('Error obteniendo expediente:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar datos del expediente
router.put('/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const { age, skinType, allergies, medicalHistory, objectives, observations } = req.body;

    const record = await prisma.clientRecord.update({
      where: { id: recordId },
      data: {
        age: age ? parseInt(age) : null,
        skinType,
        allergies,
        medicalHistory,
        objectives,
        observations
      }
    });

    res.json({ success: true, data: record });
  } catch (error) {
    console.error('Error actualizando expediente:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SESIONES ====================

// Obtener sesiones de un expediente
router.get('/:recordId/sessions', async (req, res) => {
  try {
    const { recordId } = req.params;

    const sessions = await prisma.treatmentSession.findMany({
      where: { recordId },
      orderBy: { date: 'desc' },
      include: {
        photos: true
      }
    });

    res.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Error obteniendo sesiones:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear nueva sesión
router.post('/:recordId/sessions', async (req, res) => {
  try {
    const { recordId } = req.params;
    const {
      treatmentType,
      serviceName,
      staffName,
      deviceName,
      deviceSettings,
      treatedAreas,
      productsUsed,
      observations,
      results,
      recommendations,
      date
    } = req.body;

    const session = await prisma.treatmentSession.create({
      data: {
        recordId,
        date: date ? new Date(date) : new Date(),
        treatmentType,
        serviceName,
        staffName,
        deviceName,
        deviceSettings: deviceSettings || null,
        treatedAreas,
        productsUsed,
        observations,
        results,
        recommendations
      },
      include: {
        photos: true
      }
    });

    res.json({ success: true, data: session });
  } catch (error) {
    console.error('Error creando sesión:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar sesión
router.put('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const {
      treatmentType,
      serviceName,
      staffName,
      deviceName,
      deviceSettings,
      treatedAreas,
      productsUsed,
      observations,
      results,
      recommendations
    } = req.body;

    const session = await prisma.treatmentSession.update({
      where: { id: sessionId },
      data: {
        treatmentType,
        serviceName,
        staffName,
        deviceName,
        deviceSettings: deviceSettings || null,
        treatedAreas,
        productsUsed,
        observations,
        results,
        recommendations
      },
      include: {
        photos: true
      }
    });

    res.json({ success: true, data: session });
  } catch (error) {
    console.error('Error actualizando sesión:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar sesión
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Eliminar fotos de Cloudinary primero
    const photos = await prisma.clientPhoto.findMany({
      where: { sessionId }
    });

    for (const photo of photos) {
      if (photo.publicId) {
        try {
          await cloudinary.uploader.destroy(photo.publicId);
        } catch (e) {
          console.error('Error eliminando foto de Cloudinary:', e);
        }
      }
    }

    await prisma.treatmentSession.delete({
      where: { id: sessionId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando sesión:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== FOTOS ====================

// Subir foto
router.post('/:recordId/photos', upload.single('photo'), async (req, res) => {
  try {
    const { recordId } = req.params;
    const { sessionId, type, category, area, description } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen' });
    }

    // Subir a Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer, `venus-expedientes/${recordId}`);

    // Guardar en BD
    const photo = await prisma.clientPhoto.create({
      data: {
        recordId,
        sessionId: sessionId || null,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        type: type || 'progress',
        category,
        area,
        description
      }
    });

    res.json({ success: true, data: photo });
  } catch (error) {
    console.error('Error subiendo foto:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Subir múltiples fotos
router.post('/:recordId/photos/bulk', upload.array('photos', 10), async (req, res) => {
  try {
    const { recordId } = req.params;
    const { sessionId, type, category } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No se recibieron imágenes' });
    }

    const uploadedPhotos = [];

    for (const file of req.files) {
      const uploadResult = await uploadToCloudinary(file.buffer, `venus-expedientes/${recordId}`);

      const photo = await prisma.clientPhoto.create({
        data: {
          recordId,
          sessionId: sessionId || null,
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          type: type || 'progress',
          category
        }
      });

      uploadedPhotos.push(photo);
    }

    res.json({ success: true, data: uploadedPhotos });
  } catch (error) {
    console.error('Error subiendo fotos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar descripción de foto
router.put('/photos/:photoId', async (req, res) => {
  try {
    const { photoId } = req.params;
    const { type, category, area, description } = req.body;

    const photo = await prisma.clientPhoto.update({
      where: { id: photoId },
      data: { type, category, area, description }
    });

    res.json({ success: true, data: photo });
  } catch (error) {
    console.error('Error actualizando foto:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar foto
router.delete('/photos/:photoId', async (req, res) => {
  try {
    const { photoId } = req.params;

    const photo = await prisma.clientPhoto.findUnique({
      where: { id: photoId }
    });

    if (!photo) {
      return res.status(404).json({ success: false, error: 'Foto no encontrada' });
    }

    // Eliminar de Cloudinary
    if (photo.publicId) {
      try {
        await cloudinary.uploader.destroy(photo.publicId);
      } catch (e) {
        console.error('Error eliminando de Cloudinary:', e);
      }
    }

    // Eliminar de BD
    await prisma.clientPhoto.delete({
      where: { id: photoId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando foto:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== COMPARACIÓN ANTES/DESPUÉS ====================

// Obtener pares de fotos para comparación
router.get('/:recordId/compare', async (req, res) => {
  try {
    const { recordId } = req.params;
    const { category, area } = req.query;

    const where = { recordId };
    if (category) where.category = category;
    if (area) where.area = area;

    const photos = await prisma.clientPhoto.findMany({
      where,
      orderBy: { takenAt: 'asc' }
    });

    // Agrupar por categoría/área para comparación
    const grouped = {};
    photos.forEach(photo => {
      const key = `${photo.category || 'general'}_${photo.area || 'general'}`;
      if (!grouped[key]) {
        grouped[key] = { before: [], after: [], progress: [] };
      }
      grouped[key][photo.type].push(photo);
    });

    res.json({ success: true, data: grouped });
  } catch (error) {
    console.error('Error obteniendo comparación:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ESTADÍSTICAS ====================

// Obtener resumen del expediente
router.get('/:recordId/summary', async (req, res) => {
  try {
    const { recordId } = req.params;

    const record = await prisma.clientRecord.findUnique({
      where: { id: recordId },
      include: {
        _count: {
          select: {
            sessions: true,
            photos: true
          }
        }
      }
    });

    if (!record) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }

    // Última sesión
    const lastSession = await prisma.treatmentSession.findFirst({
      where: { recordId },
      orderBy: { date: 'desc' }
    });

    // Tratamientos más frecuentes
    const treatments = await prisma.treatmentSession.groupBy({
      by: ['treatmentType'],
      where: { recordId },
      _count: true,
      orderBy: { _count: { treatmentType: 'desc' } },
      take: 5
    });

    res.json({
      success: true,
      data: {
        totalSessions: record._count.sessions,
        totalPhotos: record._count.photos,
        lastSession,
        topTreatments: treatments
      }
    });
  } catch (error) {
    console.error('Error obteniendo resumen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
