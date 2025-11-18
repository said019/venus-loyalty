    // lib/api/google.js
import { buildGoogleSaveUrl, createLoyaltyClass, googleWalletDiagnostics } from '../google.js';

// Handler para crear clase
export async function createClassHandler(req, res) {
  try {
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
    const diagnostics = await googleWalletDiagnostics();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      diagnostics: diagnostics
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
    // Obtener parámetros de la URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const params = url.searchParams;
    
    const cardId = params.get('cardId');
    const name = params.get('name') || 'Cliente';
    const stamps = parseInt(params.get('stamps'));
    const max = parseInt(params.get('max'));

    // Validaciones
    if (!cardId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        error: 'Falta cardId' 
      }));
    }
    
    if (isNaN(stamps) || isNaN(max)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        error: 'stamps y max deben ser números' 
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
