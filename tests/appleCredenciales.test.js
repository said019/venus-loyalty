// tests/appleCredenciales.test.js
// Run: node --test tests/appleCredenciales.test.js
//
// Bug real (17-sep-2026): la tarjeta pública decía "Apple Wallet (próximamente)"
// y la de masajes no enseñaba botón de Apple, aunque los .pkpass SÍ se generaban
// en producción. El botón exigía APPLE_PASS_CERT + APPLE_PASS_KEY (herencia de
// Render), pero el firmado nunca las necesitó: cae a los archivos del repo. En
// Railway esas dos variables no existen, así que el botón mentía.
//
// La regla vive en un solo lugar y la usan los dos: el que firma y el que
// decide si se pinta el botón.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applePassDisponible, FUENTES_APPLE, rutaDe } from '../lib/apple-credenciales.js';

const IDS = { APPLE_TEAM_ID: 'TEAM123', APPLE_PASS_TYPE_ID: 'pass.com.venusloyalty.mx' };
const ningunArchivo = () => false;
const todosLosArchivos = () => true;

test('producción real: solo los IDs y los archivos del repo → disponible', () => {
  // Exactamente lo que hay en Railway hoy: sin APPLE_PASS_CERT ni APPLE_PASS_KEY.
  assert.equal(applePassDisponible(IDS, todosLosArchivos), true);
});

test('sin APPLE_TEAM_ID no hay pase', () => {
  assert.equal(applePassDisponible({ APPLE_PASS_TYPE_ID: 'x' }, todosLosArchivos), false);
});

test('sin APPLE_PASS_TYPE_ID no hay pase', () => {
  assert.equal(applePassDisponible({ APPLE_TEAM_ID: 'x' }, todosLosArchivos), false);
});

test('con los IDs pero sin ningún certificado → no disponible', () => {
  assert.equal(applePassDisponible(IDS, ningunArchivo), false);
});

test('certificados inline en variables (sin archivos) → disponible', () => {
  const env = {
    ...IDS,
    APPLE_SIGNER_CERT_PEM: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
    APPLE_SIGNER_KEY_PEM: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    APPLE_WWDR_CERT_PEM: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
  };
  assert.equal(applePassDisponible(env, ningunArchivo), true);
});

test('falta UNA de las tres piezas (el WWDR) → no disponible', () => {
  const soloFaltaWwdr = (ruta) => ruta !== './wwdr_rsa.pem';
  assert.equal(applePassDisponible(IDS, soloFaltaWwdr), false);
});

test('una variable inline vacía no cuenta como certificado', () => {
  const env = { ...IDS, APPLE_SIGNER_CERT_PEM: '   ', APPLE_SIGNER_KEY_PEM: '', APPLE_WWDR_CERT_PEM: '' };
  assert.equal(applePassDisponible(env, ningunArchivo), false);
});

test('la ruta por variable (Render) gana sobre el archivo del repo', () => {
  assert.equal(rutaDe(FUENTES_APPLE.signerCert, { APPLE_PASS_CERT: '/secretos/pass.pem' }), '/secretos/pass.pem');
});

test('sin ruta por variable se usa el archivo del repo', () => {
  assert.equal(rutaDe(FUENTES_APPLE.signerCert, {}), './pass.pem');
  assert.equal(rutaDe(FUENTES_APPLE.signerKey, {}), './pass.key');
  assert.equal(rutaDe(FUENTES_APPLE.wwdr, {}), './wwdr_rsa.pem');
});

test('el WWDR por defecto es el G4/RSA: el G6 (wwdr.pem) rompe el firmado', () => {
  // node-forge no soporta ECDSA ("OID is not RSA"). Cambiar este default a
  // wwdr.pem tumbaría todos los pases.
  assert.equal(FUENTES_APPLE.wwdr.porDefecto, './wwdr_rsa.pem');
});

test('los archivos que firman de verdad existen en el repo', async () => {
  const fs = await import('node:fs');
  for (const f of Object.values(FUENTES_APPLE)) {
    assert.ok(fs.existsSync(f.porDefecto), `falta ${f.porDefecto} en la raíz del repo`);
  }
});
