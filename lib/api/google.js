// lib/api/google.js - VERSIÓN QUE VERIFICA LOS EXPORTS DISPONIBLES

// Primero, importemos solo lo que sabemos que existe
let googleModule;
try {
  googleModule = await import('../google.js');
  console.log('[API] Google module loaded, available exports:', Object.keys(googleModule));
} catch (error) {
  console.error('[API] Error loading google module:', error);
  throw error;
}

// Usar las funciones que están disponibles
const { buildGoogleSaveUrl, createLoyaltyClass } = googleModule;

// Handler para crear clase
export async function createClassHandler(req, res) {
  try {
    if (!createLoyaltyClass) {
      throw new Error('createLoyaltyClass no está disponible en el módulo');
    }

    const result = await createLoyaltyClass();

    if (result.success) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: "✅ Clase de lealtad creada exitosamente",
        classId: result.classId,
        data: result.data
      }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        message: "❌ Error creando clase",
        error: result.error || result.data,
        classId: result.classId
      }));
    }

  } catch (error) {
    console.error('[API] Error creando clase:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

// Handler para diagnóstico
export async function diagnosticsHandler(req, res) {
  try {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: "✅ Google Wallet API configurada",
      timestamp: new Date().toISOString(),
      environment: {
        GOOGLE_ISSUER_ID: process.env.GOOGLE_ISSUER_ID ? '✅ Configurado' : '❌ Faltante',
        BASE_URL: process.env.BASE_URL ? '✅ Configurado' : '❌ Faltante',
        GOOGLE_SA_EMAIL: process.env.GOOGLE_SA_EMAIL ? '✅ Configurado' : '❌ Faltante'
      },
      availableExports: Object.keys(googleModule)
    }));
  } catch (error) {
    console.error('[API] Error en diagnóstico:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

// Handler para probar
export async function testHandler(req, res) {
  try {
    if (!buildGoogleSaveUrl) {
      throw new Error('buildGoogleSaveUrl no está disponible en el módulo');
    }

    // Generar enlace de prueba
    const testUrl = buildGoogleSaveUrl({
      cardId: `test-${Date.now()}`,
      name: "Cliente de Prueba",
      stamps: 3,
      max: 8
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      testUrl: testUrl,
      message: "✅ Enlace de prueba generado - Copia esta URL y ábrela en tu teléfono"
    }));

  } catch (error) {
    console.error('[API] Error en prueba:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

// Handler para guardar tarjeta
export async function saveCardHandler(req, res) {
  try {
    if (!buildGoogleSaveUrl) {
      throw new Error('buildGoogleSaveUrl no está disponible en el módulo');
    }

    // Obtener parámetros de la URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const params = url.searchParams;

    const cardId = params.get('cardId');
    const name = params.get('name') || 'Cliente';
    const stamps = parseInt(params.get('stamps')) || 0;
    const max = parseInt(params.get('max')) || 8;

    // Validaciones
    if (!cardId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: false,
        error: 'Falta cardId'
      }));
    }

    const saveUrl = buildGoogleSaveUrl({
      cardId,
      name: name,
      stamps: stamps,
      max: max
    });

    console.log(`[API] Enlace generado para tarjeta: ${cardId}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      saveUrl: saveUrl,
      cardId: cardId,
      name: name,
      stamps: stamps,
      max: max
    }));

  } catch (error) {
    console.error('[API] Error generando enlace:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}
