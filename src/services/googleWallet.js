/**
 * Google Wallet Loyalty Card Generator — Venus Beauty
 * Uses googleapis (already installed)
 *
 * PREREQUISITES:
 *   - Google Pay & Wallet Console account
 *   - Issuer ID (from console.google.com/wallet)
 *   - Service Account JSON with wallet.object.all permission
 *
 * ENV variables needed:
 *   GOOGLE_WALLET_ISSUER_ID        e.g. 3388000000123456789
 *   GOOGLE_WALLET_SERVICE_ACCOUNT  JSON string or path to service account key
 */

import { google } from 'googleapis';

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID;
const CLASS_SUFFIX = 'venusLoyaltyClass';
const CLASS_ID = `${ISSUER_ID}.${CLASS_SUFFIX}`;

const CARD_CONFIGS = {
    loyalty: {
        label: 'Lealtad',
        hexBg: '#8C9668',
        hexFg: '#FFFFFF',
    },
    annual: {
        label: 'Constancia Anual',
        hexBg: '#C4A77D',
        hexFg: '#FFFFFF',
    },
    gold: {
        label: 'Gold VIP',
        hexBg: '#1E1E1E',
        hexFg: '#C4A77D',
    },
};

function getAuth() {
    const sa = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT;
    if (!sa) throw new Error('GOOGLE_WALLET_SERVICE_ACCOUNT not set');

    let credentials;
    try {
        credentials = JSON.parse(sa);
    } catch {
        // If it's a file path
        const { readFileSync } = require('fs');
        credentials = JSON.parse(readFileSync(sa, 'utf-8'));
    }

    return new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
    });
}

/**
 * Ensure the Loyalty Class exists (create if not)
 */
async function ensureClass(client) {
    const walletobjects = google.walletobjects({ version: 'v1', auth: client });

    try {
        await walletobjects.loyaltyclass.get({ resourceId: CLASS_ID });
    } catch (err) {
        if (err.code === 404) {
            await walletobjects.loyaltyclass.insert({
                requestBody: {
                    id: CLASS_ID,
                    issuerName: 'Venus Beauty',
                    programName: 'Venus Loyalty',
                    programLogo: {
                        sourceUri: { uri: 'https://venus-loyalty.onrender.com/assets/logo.png' },
                        contentDescription: { defaultValue: { language: 'es-MX', value: 'Logo Venus' } },
                    },
                    reviewStatus: 'UNDER_REVIEW',
                    hexBackgroundColor: '#8C9668',
                    countryCode: 'MX',
                },
            });
        } else {
            throw err;
        }
    }
}

/**
 * Create or update a Google Wallet Loyalty Object for a card
 * Returns the "Add to Google Wallet" URL
 * @param {Object} card - Prisma Card record
 * @returns {string} - Google Wallet save URL
 */
export async function generateGoogleWalletUrl(card) {
    if (!ISSUER_ID) throw new Error('GOOGLE_WALLET_ISSUER_ID not set');

    const auth = getAuth();
    const client = await auth.getClient();
    await ensureClass(client);

    const walletobjects = google.walletobjects({ version: 'v1', auth: client });
    const config = CARD_CONFIGS[card.cardType] || CARD_CONFIGS.loyalty;
    const objectId = `${ISSUER_ID}.${card.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const loyaltyPoints = card.sessionsTotal > 0
        ? {
            label: 'Sesiones restantes',
            balance: { int: card.sessionsTotal - card.sessionsUsed },
        }
        : {
            label: 'Sellos',
            balance: { int: card.stamps },
        };

    const objectBody = {
        id: objectId,
        classId: CLASS_ID,
        state: 'ACTIVE',
        accountId: card.phone,
        accountName: card.name,
        hexBackgroundColor: config.hexBg,
        loyaltyPoints,
        textModulesData: [
            { header: 'Plan', body: config.label, id: 'plan' },
            { header: 'Teléfono', body: card.phone, id: 'phone' },
        ],
        linksModuleData: {
            uris: [
                {
                    uri: `https://venus-loyalty.onrender.com/card/${card.id}`,
                    description: 'Ver tarjeta',
                    id: 'cardLink',
                },
            ],
        },
    };

    // Upsert the object
    try {
        await walletobjects.loyaltyobject.get({ resourceId: objectId });
        await walletobjects.loyaltyobject.patch({ resourceId: objectId, requestBody: objectBody });
    } catch (err) {
        if (err.code === 404) {
            await walletobjects.loyaltyobject.insert({ requestBody: objectBody });
        } else {
            throw err;
        }
    }

    // Build JWT save URL
    const { SignJWT } = await import('jose');
    const keyData = JSON.parse(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT);
    const privateKey = keyData.private_key;

    const { createPrivateKey } = await import('crypto');
    const key = createPrivateKey(privateKey);

    const token = await new SignJWT({
        iss: keyData.client_email,
        aud: 'google',
        typ: 'savetowallet',
        payload: {
            loyaltyObjects: [{ id: objectId }],
        },
    })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .sign(key);

    return `https://pay.google.com/gp/v/save/${token}`;
}
