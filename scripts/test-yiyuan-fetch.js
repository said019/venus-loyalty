#!/usr/bin/env node
// scripts/test-yiyuan-fetch.js — CLI para probar la integración Yiyuan sin levantar el server
//
// Uso:
//   node scripts/test-yiyuan-fetch.js <shareId|URL-completa>
//
// Ejemplo:
//   node scripts/test-yiyuan-fetch.js 88a29e9bbc149e39ed21b840b3647017
//   node scripts/test-yiyuan-fetch.js 'https://zm.yiyuan.ai/zmskinweb/#/report?shareId=88a29e...&locale=es'
//
// Produce:
//   tmp/yiyuan-raw.json           — respuesta cruda
//   tmp/venus-normalized.json     — modelo Venus normalizado

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    fetchYiyuanShareDetail,
    extractShareId,
    YiyuanApiError,
} from '../src/services/yiyuan.js';
import { normalizeYiyuanResponse } from '../src/services/skinNormalizer.js';

const SEVERITY_COLOR = {
    excellent: '\x1b[32m', // verde
    good: '\x1b[36m',       // cian
    moderate: '\x1b[33m',   // amarillo
    concern: '\x1b[35m',    // magenta
    critical: '\x1b[31m',   // rojo
};
const RESET = '\x1b[0m';

function printBar(score, width = 20) {
    const filled = Math.round((score / 100) * width);
    return '█'.repeat(filled).padEnd(width, '░');
}

async function main() {
    const input = process.argv[2];
    if (!input) {
        console.error('Uso: node scripts/test-yiyuan-fetch.js <shareId|URL>');
        process.exit(1);
    }

    const shareId = extractShareId(input);
    if (!shareId) {
        console.error(`❌ No pude extraer shareId de: ${input}`);
        process.exit(1);
    }

    console.log(`→ Descargando reporte shareId=${shareId}...`);

    let raw;
    try {
        raw = await fetchYiyuanShareDetail(shareId);
    } catch (err) {
        if (err instanceof YiyuanApiError) {
            console.error(`❌ Yiyuan: ${err.message}`);
            if (err.code != null) console.error(`   código de negocio: ${err.code}`);
            if (err.status != null) console.error(`   HTTP: ${err.status}`);
            if (err.raw) console.error(JSON.stringify(err.raw, null, 2).slice(0, 500));
            process.exit(1);
        }
        console.error('❌ Error inesperado:', err);
        process.exit(1);
    }

    console.log(`  ✓ cliente: ${raw.nickname} (${raw.mobile})`);
    console.log(`  ✓ edad: ${raw.age} años, fototipo: ${raw.analysis?.color?.result || 'n/a'}`);
    console.log(`  ✓ tipo de piel: ${raw.analysis?.skin_type?.type || 'n/a'}`);

    const normalized = normalizeYiyuanResponse(raw);

    console.log('\n→ Datos del cliente:');
    console.log(`  Nombre:     ${normalized.client.nickname}`);
    console.log(`  Teléfono:   ${normalized.client.mobile}`);
    console.log(`  Edad real:  ${normalized.client.ageReal} años`);
    console.log(`  Edad biol.: ${normalized.client.ageBiological} años`);
    console.log(`  Piel:       ${normalized.client.skinType} / ${normalized.client.skinColor}`);
    console.log(`  ITA:        ${normalized.client.ita}`);
    if (normalized.faceShape) console.log(`  Rostro:     ${normalized.faceShape}`);
    console.log(`  Score:      ${normalized.overallScore}/100`);

    console.log('\n→ Métricas normalizadas:');
    for (const m of normalized.metrics) {
        const color = SEVERITY_COLOR[m.severity] || '';
        const bar = printBar(m.score);
        const scoreStr = String(Math.round(m.score)).padStart(3);
        const label = m.labelEs.padEnd(28);
        console.log(`  ${label} ${bar} ${scoreStr}/100  ${color}[${m.severity}]${RESET}`);
    }

    console.log(`\n→ ${normalized.images.length} imágenes disponibles:`);
    for (const img of normalized.images.slice(0, 8)) {
        console.log(`  · ${img.labelEs.padEnd(40)} ${img.url.slice(0, 60)}...`);
    }
    if (normalized.images.length > 8) {
        console.log(`  ... y ${normalized.images.length - 8} más`);
    }

    const outDir = resolve(process.cwd(), 'tmp');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'yiyuan-raw.json'), JSON.stringify(raw, null, 2));
    writeFileSync(
        resolve(outDir, 'venus-normalized.json'),
        JSON.stringify(
            {
                ...normalized,
                // BigInt no serializa
                yiyuanAnalysisId: String(normalized.yiyuanAnalysisId),
                rawResponse: '[truncated - ver yiyuan-raw.json]',
            },
            null,
            2
        )
    );

    console.log(`\n✅ Archivos guardados en ${outDir}/`);
    console.log('   · yiyuan-raw.json');
    console.log('   · venus-normalized.json');
}

main().catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
