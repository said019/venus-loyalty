// lib/apple.js
// Stub temporal. Luego generaremos el .pkpass real firmado.
export async function buildApplePassBuffer({ cardId, name, stamps = 0, max = 8 }) {
  const txt = `PASS FAKE\ncardId=${cardId}\nname=${name}\nstamps=${stamps}/${max}\n`;
  return Buffer.from(txt, "utf-8");
}
