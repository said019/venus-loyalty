// tests/canjeLealtad.test.js
// Run: node --test tests/canjeLealtad.test.js
//
// Dos bugs reales del canje de tarjeta de lealtad (jul-2026):
//
// 1) POST /api/redeem/:cardId (escáner de recepción) armaba la respuesta con
//    `addToAppleUrl`, variable que nunca se declaró en ese handler → lanzaba
//    ReferenceError y devolvía 500 SIEMPRE, aunque el canje ya se había hecho.
//    En mostrador se leía "Error al canjear" sobre un canje correcto, y al
//    reintentar salía "Aún no completa los sellos" (ya estaban en 0).
//
// 2) La lógica del canje estaba duplicada en ese endpoint y en
//    /api/admin/redeem, y las copias se separaron: la de recepción no
//    incrementaba `cycles`, así que los canjes del mostrador no le sumaban
//    historial a la clienta (el ranking usa stamps + cycles*8).
//
// Estas pruebas leen el fuente: server.js no se puede importar sin levantar
// el servidor y la base.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SERVER = fs.readFileSync('server.js', 'utf8');

// Devuelve el cuerpo de cada handler app.get/post/put/patch/delete, por conteo
// de llaves desde la primera '{' del callback.
function handlers(src) {
  const out = [];
  const re = /app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = re.exec(src))) {
    const start = src.indexOf('{', m.index);
    if (start === -1) continue;
    let depth = 0;
    let end = start;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    out.push({ method: m[1], ruta: m[2], cuerpo: src.slice(start, end + 1) });
  }
  return out;
}

test('ningún handler usa addToAppleUrl sin declararlo', () => {
  for (const h of handlers(SERVER)) {
    if (!h.cuerpo.includes('addToAppleUrl')) continue;
    const declarado = /(const|let|var)\s+addToAppleUrl\b/.test(h.cuerpo)
      || /addToAppleUrl\s*:/.test(h.cuerpo); // definido inline en la respuesta
    assert.ok(declarado, `${h.method.toUpperCase()} ${h.ruta} usa addToAppleUrl sin declararlo`);
  }
});

test('los dos endpoints de canje delegan en el mismo helper', () => {
  const rutas = ['/api/redeem/:cardId', '/api/admin/redeem'];
  for (const ruta of rutas) {
    const h = handlers(SERVER).find(x => x.ruta === ruta);
    assert.ok(h, `no se encontró el endpoint ${ruta}`);
    assert.match(h.cuerpo, /redeemLoyaltyCard\(/,
      `${ruta} no usa redeemLoyaltyCard: la lógica volvió a duplicarse`);
    // Y no debe reimplementar el canje por su cuenta
    assert.doesNotMatch(h.cuerpo, /fsAddEvent\(\s*cardId\s*,\s*["'`]REDEEM/,
      `${ruta} registra el evento por su cuenta en vez de delegar`);
  }
});

test('el canje resetea sellos e incrementa ciclos en un solo lugar', () => {
  const helper = SERVER.match(/async function redeemLoyaltyCard[\s\S]*?\n}\n/);
  assert.ok(helper, 'no existe redeemLoyaltyCard');
  const cuerpo = helper[0];

  assert.match(cuerpo, /stamps:\s*0/, 'el canje debe reiniciar los sellos');
  assert.match(cuerpo, /cycles:\s*newCycles/, 'el canje debe incrementar el ciclo');
  assert.match(cuerpo, /\(card\.cycles \|\| 0\) \+ 1/, 'el ciclo se cuenta desde el valor actual');
  assert.match(cuerpo, /not_enough_stamps/, 'debe bloquear el canje sin sellos completos');
  assert.match(cuerpo, /fsAddEvent\(cardId, 'REDEEM'/, 'debe dejar el evento de canje');

  // Solo una implementación en todo el server
  const ocurrencias = (SERVER.match(/async function redeemLoyaltyCard/g) || []).length;
  assert.equal(ocurrencias, 1);
});
