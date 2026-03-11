// scripts/analyze-whatsapp-2025.js
// Analiza chats de WhatsApp Business desde enero 2025
// Clasifica si cada contacto fue un cliente real o no
//
// Ejecutar: node scripts/analyze-whatsapp-2025.js

import 'dotenv/config';
import { getEvolutionClient } from '../src/services/whatsapp-evolution.js';

const evoClient = getEvolutionClient();

// Palabras clave que indican que es un CLIENTE real
const CLIENT_KEYWORDS = [
  'cita', 'agendar', 'reservar', 'turno', 'horario', 'disponible',
  'facial', 'masaje', 'depilación', 'depilacion', 'limpieza', 'tratamiento',
  'servicio', 'precio', 'costo', 'cuanto', 'cuánto', 'promoción', 'promocion', 'descuento',
  'quiero', 'necesito', 'me interesa', 'tienen', 'hacen',
  'confirmo', 'confirmar', 'reprogramar', 'cancelar',
  'venus', 'sesión', 'sesion', 'paquete',
  'lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado',
  'mañana', 'manana', 'hoy', 'semana',
  'tarjeta', 'lealtad', 'sello', 'puntos',
  'gracias', 'perfecto', 'ok', 'si', 'sí', 'va', 'sale',
  'buenas tardes', 'buenas noches', 'buenos días', 'buenos dias', 'hola',
  'ubicación', 'ubicacion', 'dirección', 'direccion', 'donde están', 'donde estan',
  'básico', 'basico', 'anual', 'membresía', 'membresia',
];

// Palabras clave que indican que NO es cliente (spam, proveedores, etc.)
const NOT_CLIENT_KEYWORDS = [
  'proveedor', 'venta', 'distribui', 'catálogo', 'catalogo', 'mayoreo',
  'publicidad', 'marketing', 'google ads', 'facebook ads', 'instagram',
  'préstamo', 'prestamo', 'crédito', 'credito', 'inversión', 'inversion',
  'vacante', 'empleo', 'trabajo', 'cv', 'curriculum',
  'encuesta', 'sorteo', 'ganador', 'premio',
];

function classifyChat(messages) {
  let clientScore = 0;
  let notClientScore = 0;
  const incomingTexts = [];

  for (const msg of messages) {
    // Solo analizar mensajes entrantes (del contacto, no nuestros)
    const isFromMe = msg.key?.fromMe || false;
    const text = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.buttonsResponseMessage?.selectedDisplayText ||
      msg.message?.listResponseMessage?.title ||
      ''
    ).toLowerCase().trim();

    if (!text) continue;

    if (!isFromMe) {
      incomingTexts.push(text);
      for (const kw of CLIENT_KEYWORDS) {
        if (text.includes(kw)) clientScore++;
      }
      for (const kw of NOT_CLIENT_KEYWORDS) {
        if (text.includes(kw)) notClientScore += 3;
      }
    } else {
      // Si Venus respondió, probablemente es un cliente real
      if (text.length > 10) clientScore += 0.5;
    }
  }

  const isClient = clientScore > notClientScore && clientScore >= 1;
  return {
    isClient,
    clientScore,
    notClientScore,
    sampleMessages: incomingTexts.slice(0, 3), // primeros 3 mensajes entrantes
    reason: isClient
      ? `Cliente (score: ${clientScore} vs ${notClientScore})`
      : notClientScore > clientScore
        ? `No cliente - posible spam/proveedor (score: ${notClientScore} vs ${clientScore})`
        : `Indeterminado (scores bajos: ${clientScore}/${notClientScore})`,
  };
}

async function main() {
  console.log('Obteniendo chats de WhatsApp Business...\n');

  const allChats = await evoClient.fetchChats();
  console.log(`Total de chats: ${allChats.length}\n`);

  // Filtrar solo chats individuales de 2025
  const start2025 = new Date('2025-01-01T00:00:00Z').getTime() / 1000;
  const start2026 = new Date('2026-01-01T00:00:00Z').getTime() / 1000;

  const chats2025 = allChats.filter(chat => {
    const jid = chat.id || chat.remoteJid || '';
    if (!jid.endsWith('@s.whatsapp.net')) return false;
    const ts = chat.lastMsgTimestamp || chat.conversationTimestamp || chat.timestamp || 0;
    const tsNum = typeof ts === 'object' ? Number(ts.low || ts) : Number(ts);
    return tsNum >= start2025 && tsNum < start2026;
  });

  console.log(`Chats individuales de 2025: ${chats2025.length}\n`);

  if (chats2025.length === 0) {
    // Si no hay filtro por timestamp, puede ser que el campo sea diferente
    // Imprimir estructura de un chat para debug
    console.log('No se encontraron chats de 2025. Verificando estructura de datos...\n');
    if (allChats.length > 0) {
      const sample = allChats[0];
      console.log('Ejemplo de chat:', JSON.stringify(sample, null, 2).substring(0, 1000));
      console.log('\nCampos disponibles:', Object.keys(sample).join(', '));
    }

    // Intentar sin filtro de fecha - tomar todos los chats individuales
    console.log('\n--- Analizando TODOS los chats individuales sin filtro de fecha ---\n');
    const allIndividual = allChats.filter(chat => {
      const jid = chat.id || chat.remoteJid || '';
      return jid.endsWith('@s.whatsapp.net');
    });
    console.log(`Chats individuales (sin filtro): ${allIndividual.length}\n`);
    await analyzeChats(allIndividual);
    return;
  }

  await analyzeChats(chats2025);
}

async function analyzeChats(chats) {
  const results = { clients: [], notClients: [], unknown: [] };
  let processed = 0;

  for (const chat of chats) {
    const jid = chat.id || chat.remoteJid || '';
    const phone = jid.replace('@s.whatsapp.net', '');
    const name = chat.name || chat.pushName || chat.contact?.pushName || phone;

    try {
      // Obtener últimos mensajes del chat
      const messages = await evoClient.fetchMessages(jid, 20);
      const analysis = classifyChat(messages);

      const entry = {
        phone,
        name,
        ...analysis,
      };

      if (analysis.isClient) {
        results.clients.push(entry);
      } else if (analysis.notClientScore > analysis.clientScore) {
        results.notClients.push(entry);
      } else {
        results.unknown.push(entry);
      }

      processed++;
      if (processed % 10 === 0) {
        console.log(`Procesados: ${processed}/${chats.length}...`);
      }

      // Pausa para no saturar la API
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`Error analizando ${phone}: ${err.message}`);
    }
  }

  // Resultados
  console.log('\n' + '='.repeat(60));
  console.log('RESULTADOS DEL ANÁLISIS');
  console.log('='.repeat(60));

  console.log(`\nCLIENTES REALES (${results.clients.length}):`);
  console.log('-'.repeat(40));
  for (const c of results.clients) {
    console.log(`  ${c.name.padEnd(25)} ${c.phone.padEnd(15)} ${c.reason}`);
    if (c.sampleMessages.length > 0) {
      console.log(`    > "${c.sampleMessages[0].substring(0, 80)}"`);
    }
  }

  console.log(`\nNO CLIENTES / SPAM (${results.notClients.length}):`);
  console.log('-'.repeat(40));
  for (const c of results.notClients) {
    console.log(`  ${c.name.padEnd(25)} ${c.phone.padEnd(15)} ${c.reason}`);
    if (c.sampleMessages.length > 0) {
      console.log(`    > "${c.sampleMessages[0].substring(0, 80)}"`);
    }
  }

  console.log(`\nINDETERMINADOS (${results.unknown.length}):`);
  console.log('-'.repeat(40));
  for (const c of results.unknown) {
    console.log(`  ${c.name.padEnd(25)} ${c.phone.padEnd(15)} ${c.reason}`);
    if (c.sampleMessages.length > 0) {
      console.log(`    > "${c.sampleMessages[0].substring(0, 80)}"`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`RESUMEN:`);
  console.log(`  Clientes reales:  ${results.clients.length}`);
  console.log(`  No clientes:      ${results.notClients.length}`);
  console.log(`  Indeterminados:   ${results.unknown.length}`);
  console.log(`  Total analizados: ${processed}`);
  console.log('='.repeat(60));

  // Guardar resultados en JSON para usar después
  const outputPath = new URL('../promo-analysis-2025.json', import.meta.url).pathname;
  const fs = await import('fs');
  fs.writeFileSync(outputPath, JSON.stringify({
    analyzedAt: new Date().toISOString(),
    clients: results.clients.map(c => ({ phone: c.phone, name: c.name, score: c.clientScore })),
    notClients: results.notClients.map(c => ({ phone: c.phone, name: c.name })),
    unknown: results.unknown.map(c => ({ phone: c.phone, name: c.name, messages: c.sampleMessages })),
  }, null, 2));
  console.log(`\nResultados guardados en: promo-analysis-2025.json`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
