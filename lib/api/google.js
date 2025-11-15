// lib/api/google.js - HANDLERS PARA LAS RUTAS GOOGLE WALLET
import { buildGoogleSaveUrl, createLoyaltyClass, googleWalletDiagnostics, testObjectCreation } from '../google.js';

// Handler para crear clase
export async function createClassHandler(req, res) {
  try {
    const result = await createLoyaltyClass();
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: "✅ Clase de lealtad creada exitosamente",
        classId: result.classId,
        data: result.data
      });
    } else {
      // Si ya existe o hay error
      res.status(result.status === 409 ? 200 : 400).json({
        success: false,
        message: "❌ Error creando clase",
        error: result.error || result.data,
        classId: result.classId
      });
    }
    
  } catch (error) {
    console.error('[API] Error creando clase:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Handler para diagnóstico
export async function diagnosticsHandler(req, res) {
  try {
    const diagnostics = await googleWalletDiagnostics();
    
    // Formatear respuesta para mejor legibilidad
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      diagnostics: diagnostics
    });
    
  } catch (error) {
    console.error('[API] Error en diagnóstico:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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

    res.status(200).json({
      success: true,
      testUrl: testUrl,
      message: "✅ Enlace de prueba generado - Copia esta URL y ábrela en tu teléfono"
    });

  } catch (error) {
    console.error('[API] Error en prueba:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
      res.status(400).json({ 
        error: 'Falta cardId' 
      });
      return;
    }
    
    if (isNaN(stamps) || isNaN(max)) {
      res.status(400).json({ 
        error: 'stamps y max deben ser números' 
      });
      return;
    }

    const saveUrl = buildGoogleSaveUrl({
      cardId,
      name: name,
      stamps: stamps,
      max: max
    });

    console.log(`[API] Enlace generado para tarjeta: ${cardId}`);
    
    res.status(200).json({
      success: true,
      saveUrl: saveUrl,
      cardId: cardId,
      name: name,
      stamps: stamps,
      max: max
    });

  } catch (error) {
    console.error('[API] Error generando enlace:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}