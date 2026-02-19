/**
 * Apple Wallet Pass Generator — Venus Beauty
 * Uses passkit-generator (v3.x) already installed
 *
 * PREREQUISITES:
 *   - Apple Developer Account ($99/año)
 *   - Pass Type ID registered: pass.com.venusbeauty.loyalty
 *   - Signing certificate + private key (.pem files)
 *   - WWDR certificate from Apple
 *
 * ENV variables needed:
 *   APPLE_PASS_TYPE_ID     e.g. pass.com.venusbeauty.loyalty
 *   APPLE_TEAM_ID          10-char Apple Team ID
 *   APPLE_CERT_PEM         Path or base64 of signing cert PEM
 *   APPLE_KEY_PEM          Path or base64 of private key PEM
 *   APPLE_WWDR_PEM         Path or base64 of WWDR cert PEM
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = path.join(__dirname, '../../apple-pass-model');

// Card type config
const CARD_CONFIGS = {
    loyalty: {
        label: 'Lealtad',
        bgColor: 'rgb(140, 150, 104)',   // Venus green
        info: 'Acumula sellos en cada visita. Al completar 8 sellos recibes un servicio de regalo.',
    },
    annual: {
        label: 'Constancia Anual',
        bgColor: 'rgb(196, 167, 125)',   // Venus gold
        info: 'Paquete Venus Constancia Anual. Canjea tus sesiones prepagadas en cada visita.',
    },
    gold: {
        label: 'Gold VIP',
        bgColor: 'rgb(30, 30, 30)',      // Black gold
        info: 'Tarjeta Gold VIP Venus. Beneficios exclusivos y prioridad en agenda.',
    },
};

/**
 * Generate a .pkpass buffer for a card
 * @param {Object} card  - Prisma Card record
 * @returns {Buffer}     - .pkpass file buffer
 */
export async function generateApplePass(card) {
    // Lazy import to avoid crash when certs not configured
    const { PKPass } = await import('passkit-generator');

    const config = CARD_CONFIGS[card.cardType] || CARD_CONFIGS.loyalty;
    const sessionsLeft = card.sessionsTotal > 0
        ? `${card.sessionsTotal - card.sessionsUsed} sesiones restantes`
        : null;

    // Read certs from env (base64 or file path)
    function readCert(envVar, fallbackPath) {
        const val = process.env[envVar];
        if (val) {
            // If it looks like base64, decode it
            if (!val.startsWith('-----') && !existsSync(val)) {
                return Buffer.from(val, 'base64');
            }
            if (existsSync(val)) return readFileSync(val);
            return Buffer.from(val);
        }
        if (fallbackPath && existsSync(fallbackPath)) return readFileSync(fallbackPath);
        return null;
    }

    const signerCert = readCert('APPLE_CERT_PEM', path.join(__dirname, '../../certs/signerCert.pem'));
    const signerKey = readCert('APPLE_KEY_PEM', path.join(__dirname, '../../certs/signerKey.pem'));
    const wwdr = readCert('APPLE_WWDR_PEM', path.join(__dirname, '../../wwdr_rsa.pem'));

    if (!signerCert || !signerKey || !wwdr) {
        throw new Error('Apple Wallet certificates not configured. Set APPLE_CERT_PEM, APPLE_KEY_PEM, APPLE_WWDR_PEM env vars.');
    }

    const passTypeIdentifier = process.env.APPLE_PASS_TYPE_ID || 'pass.com.venusbeauty.loyalty';
    const teamIdentifier = process.env.APPLE_TEAM_ID || '';

    const pass = await PKPass.from({
        model: MODEL_PATH,
        certificates: { wwdr, signerCert, signerKey },
    }, {
        serialNumber: card.id,
        passTypeIdentifier,
        teamIdentifier,
        description: `Tarjeta Venus — ${config.label}`,
        backgroundColor: config.bgColor,

        storeCard: {
            primaryFields: [{ key: 'memberName', label: 'Nombre', value: card.name }],
            secondaryFields: [
                {
                    key: 'stamps',
                    label: card.sessionsTotal > 0 ? 'Sesiones' : 'Sellos',
                    value: card.sessionsTotal > 0
                        ? `${card.sessionsTotal - card.sessionsUsed} / ${card.sessionsTotal}`
                        : `${card.stamps} / ${card.max}`,
                },
                { key: 'cardType', label: 'Plan', value: config.label },
            ],
            auxiliaryFields: [
                { key: 'phone', label: 'Teléfono', value: card.phone },
            ],
            backFields: [
                { key: 'info', label: 'Información', value: config.info },
                { key: 'website', label: 'Agendar', value: 'https://venus-loyalty.onrender.com' },
            ],
        },
    });

    return pass.getAsBuffer();
}

/**
 * Get card display config (for UI color preview)
 */
export function getCardConfig(cardType) {
    return CARD_CONFIGS[cardType] || CARD_CONFIGS.loyalty;
}
