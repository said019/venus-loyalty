// lib/apple-credenciales.js
// De dónde salen los certificados que firman los pases de Apple Wallet, en un
// solo lugar. Lo usan los dos que tienen que estar de acuerdo:
//   - lib/apple.js, que firma el .pkpass;
//   - el endpoint de la tarjeta pública, que decide si pinta el botón.
//
// Antes cada uno tenía su propia idea: el botón exigía APPLE_PASS_CERT +
// APPLE_PASS_KEY (así se configuró en Render) y el firmado caía a los archivos
// del repo. Al mudarse a Railway esas dos variables no se pasaron, los pases se
// seguían firmando bien, y la tarjeta decía "Apple Wallet (próximamente)".
import fs from "fs";

// Cada pieza se busca en este orden: contenido inline en variable (Railway) →
// ruta a archivo en variable (Render) → archivo versionado en el repo.
export const FUENTES_APPLE = {
  signerCert: { inline: "APPLE_SIGNER_CERT_PEM", ruta: "APPLE_PASS_CERT", porDefecto: "./pass.pem" },
  signerKey: { inline: "APPLE_SIGNER_KEY_PEM", ruta: "APPLE_PASS_KEY", porDefecto: "./pass.key" },
  // OJO: G4/RSA. El G6 (wwdr.pem) es ECDSA y node-forge no lo soporta.
  wwdr: { inline: "APPLE_WWDR_CERT_PEM", ruta: "APPLE_WWDR", porDefecto: "./wwdr_rsa.pem" },
};

export function rutaDe(fuente, env = process.env) {
  return env[fuente.ruta] || fuente.porDefecto;
}

function hayPieza(fuente, env, existe) {
  const inline = env[fuente.inline];
  if (inline && String(inline).trim()) return true;
  return existe(rutaDe(fuente, env));
}

// ¿Se puede firmar un pase ahora mismo? Misma regla que usa lib/apple.js.
// No valida que el PEM inline sea un certificado bien formado: si viene basura,
// el firmado cae al archivo igual que aquí; y si tampoco hay archivo, el botón
// sale pero la descarga responde el error. Mejor eso que esconder algo que sí
// funciona, que fue el bug.
export function applePassDisponible(env = process.env, existe = fs.existsSync) {
  if (!env.APPLE_TEAM_ID || !env.APPLE_PASS_TYPE_ID) return false;
  return Object.values(FUENTES_APPLE).every((f) => hayPieza(f, env, existe));
}
