#!/usr/bin/env node
// Panel web + puente para las luces del skin analyzer Moji A3.
//
// Corre en la Mac. Habla con la máquina por `adb` y le escribe al puerto
// serial del driver board el mismo texto que manda la app oficial
// (ver PROTOCOLO.md). No hay que compilar nada para Android: la máquina
// solo necesita Depuración USB encendida (o adb por red).
//
//   node luces.mjs                 → panel en http://localhost:8080
//   node luces.mjs --fake          → sin máquina: imprime lo que mandaría
//   node luces.mjs --test          → pruebas del armado de comandos
//   node luces.mjs --su            → escribe al puerto vía `su -c` (si hace falta root)
//   node luces.mjs --version v2    → protocolo v2 (omite zonas en 0%)
//   node luces.mjs --serial /dev/ttyS4 --baud 115200 --port 8080 --uv-max 20

import http from 'node:http';
import { spawn, execFile } from 'node:child_process';

// ── Protocolo ────────────────────────────────────────────────────────────
const FIN = '\n\r'; // así, \n primero: es lo que manda la app
const LUCES = { blanca: 'W', positiva: 'P', negativa: 'N', uv: 'UV', ws: 'WS' };
export const CMD = {
  OFF: 'TCCMD_OFF' + FIN,
  PWM_SETL: 'TCCMD_PWM_SETL' + FIN,
  PWM_SETH: 'TCCMD_PWM_SETH' + FIN,
  HEART: 'TC_HEART' + FIN,
  VER: 'VER_QUERY' + FIN,
};

function pct(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) throw new Error(`porcentaje inválido: ${n}`);
  return Math.max(0, Math.min(100, v));
}

// Arma el comando de una luz. En el A3 solo se usa el centro; v1 manda las
// tres zonas (L y R en 0%), v2 omite las que van en 0%.
export function comandoLuz(luz, porcentaje, { version = 'v1', zonas } = {}) {
  const cod = LUCES[luz];
  if (!cod) throw new Error(`luz desconocida: ${luz} (usa ${Object.keys(LUCES).join(', ')})`);
  const z = zonas || { L: 0, C: porcentaje, R: 0 };
  const partes = [];
  for (const zona of ['L', 'C', 'R']) {
    const p = pct(z[zona] ?? 0);
    if (version === 'v2' && p === 0) continue;
    partes.push(`TC${zona}CMD_${cod}${p}%`);
  }
  return partes.length ? partes.join(FIN) + FIN : '';
}

// ── Argumentos ───────────────────────────────────────────────────────────
function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    o[k] = v;
  }
  return o;
}
const args = parse(process.argv.slice(2));
const CFG = {
  puerto: args.serial || '/dev/ttyS4',
  baud: Number(args.baud || 115200),
  version: args.version === 'v2' ? 'v2' : 'v1',
  fake: !!args.fake,
  su: !!args.su,
  http: Number(args.port || 8080),
  uvMaxMs: Number(args['uv-max'] || 20) * 1000,
};

// ── Transporte por adb ───────────────────────────────────────────────────
const log = (...a) => console.log(new Date().toLocaleTimeString('es-MX'), ...a);
const envolver = (cmd) => (CFG.su ? `su -c '${cmd.replace(/'/g, `'\\''`)}'` : cmd);

// Corre un comando en la máquina y devuelve su salida.
function shell(cmd) {
  if (CFG.fake) { log('[fake] shell:', cmd); return Promise.resolve(''); }
  return new Promise((res) => {
    execFile('adb', ['shell', '-T', envolver(cmd)], { timeout: 6000 }, (e, out, err) => {
      if (e) log('  adb:', (err || e.message).trim());
      res(String(out || ''));
    });
  });
}

// Escribe texto al puerto serial. `-T` = sin pty: los bytes llegan intactos.
function enviar(texto) {
  if (!texto) return Promise.resolve();
  if (CFG.fake) { log('[fake] →', JSON.stringify(texto)); return Promise.resolve(); }
  return new Promise((res, rej) => {
    const p = spawn('adb', ['shell', '-T', envolver(`cat > ${CFG.puerto}`)]);
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(err.trim() || `adb salió con ${code}`))));
    p.stdin.end(texto, 'latin1');
  });
}

let ultimo = '';
async function mandar(texto, etiqueta) {
  await enviar(texto);
  ultimo = etiqueta;
  log('→', etiqueta, JSON.stringify(texto));
}

// Configura el tty como la librería nativa (raw, sin eco) y manda el
// PWM_SETL que la app envía antes de la primera luz.
async function preparar() {
  await shell(`stty -F ${CFG.puerto} ${CFG.baud} raw -echo 2>/dev/null || stty -F ${CFG.puerto} ${CFG.baud} 2>/dev/null || true`);
  await mandar(CMD.PWM_SETL, 'PWM_SETL');
}

async function consultarVersion() {
  if (CFG.fake) { await mandar(CMD.VER, 'VER_QUERY'); return '(fake)'; }
  // Lector primero, comando después: la respuesta llega en cuanto se pide.
  const lector = shell(`timeout 2 cat ${CFG.puerto} 2>/dev/null || head -c 200 ${CFG.puerto}`);
  await new Promise((r) => setTimeout(r, 250));
  await mandar(CMD.VER, 'VER_QUERY');
  const r = (await lector).trim();
  if (r.includes('V2')) CFG.version = 'v2';
  return r || '(sin respuesta)';
}

// La UV se apaga sola: nadie debe quedar bajo ella más que el instante de una foto.
let apagadoUv = null;
function armarApagadoUv() {
  clearTimeout(apagadoUv);
  apagadoUv = setTimeout(() => mandar(CMD.OFF, 'OFF (auto UV)').catch(() => {}), CFG.uvMaxMs);
}

async function luz(nombre, porcentaje) {
  const texto = comandoLuz(nombre, porcentaje, { version: CFG.version });
  await mandar(texto, `${nombre} ${pct(porcentaje)}%`);
  if (nombre === 'uv') armarApagadoUv(); else clearTimeout(apagadoUv);
}

async function apagar() {
  clearTimeout(apagadoUv);
  await mandar(CMD.OFF, 'OFF');
}

// ── Pruebas del armado de comandos (sin máquina) ────────────────────────
if (args.test) {
  const casos = [
    ['v1 uv 80 centro', comandoLuz('uv', 80), 'TCLCMD_UV0%\n\rTCCCMD_UV80%\n\rTCRCMD_UV0%\n\r'],
    ['v2 uv 80 centro', comandoLuz('uv', 80, { version: 'v2' }), 'TCCCMD_UV80%\n\r'],
    ['v1 blanca 40 (preview)', comandoLuz('blanca', 40), 'TCLCMD_W0%\n\rTCCCMD_W40%\n\rTCRCMD_W0%\n\r'],
    ['tope 150 → 100', comandoLuz('negativa', 150, { version: 'v2' }), 'TCCCMD_N100%\n\r'],
    ['tope -5 → 0 (v2 vacío)', comandoLuz('positiva', -5, { version: 'v2' }), ''],
    ['redondeo 39.6 → 40', comandoLuz('ws', 39.6, { version: 'v2' }), 'TCCCMD_WS40%\n\r'],
    ['tres zonas v1', comandoLuz('blanca', 0, { zonas: { L: 10, C: 20, R: 30 } }), 'TCLCMD_W10%\n\rTCCCMD_W20%\n\rTCRCMD_W30%\n\r'],
    ['OFF', CMD.OFF, 'TCCMD_OFF\n\r'],
  ];
  let mal = 0;
  for (const [n, got, esp] of casos) {
    const ok = got === esp;
    if (!ok) mal++;
    console.log(`${ok ? '✓' : '✗'} ${n}${ok ? '' : `\n    obtuve ${JSON.stringify(got)}\n    esperaba ${JSON.stringify(esp)}`}`);
  }
  try { comandoLuz('roja', 50); console.log('✗ luz desconocida no falló'); mal++; }
  catch { console.log('✓ luz desconocida falla con error claro'); }
  console.log(mal ? `\n${mal} prueba(s) mal` : '\ntodo bien');
  process.exit(mal ? 1 : 0);
}

// ── Panel web ────────────────────────────────────────────────────────────
const HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Luces Moji</title>
<style>
  :root{--olivo:#6b7a4a;--crema:#f6f2ea;--tinta:#2b2b2b;--linea:#d9d2c3}
  body{margin:0;background:var(--crema);color:var(--tinta);font:16px/1.4 -apple-system,system-ui,sans-serif}
  main{max-width:520px;margin:0 auto;padding:24px 18px 48px}
  h1{font:600 26px/1.1 Georgia,serif;margin:0 0 4px}
  .sub{color:#6d6d6d;font-size:13px;margin:0 0 20px}
  .luces{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
  button{min-height:52px;border:1px solid var(--linea);border-radius:12px;background:#fff;color:var(--tinta);font-size:16px;cursor:pointer}
  button:active{transform:scale(.98)}
  button.on{background:var(--olivo);color:#fff;border-color:var(--olivo)}
  button.uv{border-color:#7c5cbf;color:#5b3fa0}button.uv.on{background:#5b3fa0;color:#fff}
  .fila{display:flex;align-items:center;gap:12px;margin:14px 0}
  input[type=range]{flex:1}
  .pct{min-width:52px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  .off{width:100%;background:#2b2b2b;color:#fff;border-color:#2b2b2b;font-weight:600}
  .estado{margin-top:18px;padding:12px 14px;border:1px dashed var(--linea);border-radius:12px;font-size:13px;color:#555;white-space:pre-wrap}
  .aviso{margin-top:14px;font-size:12px;color:#7a4a4a}
  .ghost{background:transparent;font-size:14px;min-height:44px}
</style>
<main>
  <h1>Luces Moji</h1>
  <p class="sub">Puerto ${CFG.puerto} · ${CFG.baud} · protocolo <span id="ver">${CFG.version}</span>${CFG.fake ? ' · <b>modo fake</b>' : ''}</p>
  <div class="fila"><span>Intensidad</span><input id="pct" type="range" min="0" max="100" value="40"><span class="pct" id="pctv">40%</span></div>
  <div class="luces">
    <button data-luz="blanca">Blanca</button>
    <button data-luz="positiva">Polarizada +</button>
    <button data-luz="negativa">Polarizada −</button>
    <button data-luz="ws">WS</button>
    <button data-luz="uv" class="uv">UV (se apaga sola)</button>
    <button id="verq" class="ghost">Preguntar versión al board</button>
  </div>
  <button class="off" id="off">Apagar todo</button>
  <div class="estado" id="estado">Listo.</div>
  <p class="aviso">La UV es de 365 nm: no la mires de frente. Se apaga sola a los ${CFG.uvMaxMs / 1000} s.</p>
</main>
<script>
  const $ = (s) => document.querySelector(s);
  const estado = (t) => { $('#estado').textContent = t; };
  const marcar = (luz) => document.querySelectorAll('[data-luz]').forEach(b => b.classList.toggle('on', b.dataset.luz === luz));
  $('#pct').oninput = () => { $('#pctv').textContent = $('#pct').value + '%'; };
  async function post(ruta, cuerpo) {
    const r = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo || {}) });
    const j = await r.json(); estado(j.ok ? j.msg : 'Error: ' + j.error); return j;
  }
  document.querySelectorAll('[data-luz]').forEach(b => b.onclick = async () => {
    const luz = b.dataset.luz, pct = Number($('#pct').value);
    const j = await post('/luz', { luz, pct }); if (j.ok) marcar(luz);
  });
  $('#off').onclick = async () => { await post('/apagar'); marcar(null); };
  $('#verq').onclick = async () => { const j = await post('/version'); if (j.ok) $('#ver').textContent = j.version; };
</script>`;

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function leerJson(req) {
  return new Promise((r) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
}

const servidor = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(HTML); }
    if (req.method === 'GET' && req.url === '/estado') return json(res, 200, { ok: true, cfg: CFG, ultimo });
    if (req.method === 'POST' && req.url === '/luz') {
      const { luz: nombre, pct: p } = await leerJson(req);
      await luz(nombre, p);
      return json(res, 200, { ok: true, msg: `${nombre} al ${pct(p)}%${nombre === 'uv' ? ` — se apaga sola en ${CFG.uvMaxMs / 1000} s` : ''}` });
    }
    if (req.method === 'POST' && req.url === '/apagar') { await apagar(); return json(res, 200, { ok: true, msg: 'Todo apagado' }); }
    if (req.method === 'POST' && req.url === '/version') {
      const v = await consultarVersion();
      return json(res, 200, { ok: true, msg: `El board contestó: ${v} → protocolo ${CFG.version}`, version: CFG.version, respuesta: v });
    }
    json(res, 404, { ok: false, error: 'ruta desconocida' });
  } catch (e) {
    log('✗', e.message);
    json(res, 500, { ok: false, error: e.message });
  }
});

// ── Arranque ─────────────────────────────────────────────────────────────
async function arrancar() {
  if (!CFG.fake) {
    const salida = await new Promise((r) => execFile('adb', ['devices'], (e, out) => r(e ? '' : out)));
    const dispositivos = salida.split('\n').slice(1).filter((l) => /\tdevice$/.test(l.trim()));
    if (!dispositivos.length) {
      console.log('✗ adb no ve ninguna máquina.\n  · Cable USB a la máquina y Depuración USB encendida, o\n  · adb connect <ip-de-la-máquina>:5555\n  Corre primero ./prueba-en-maquina.sh. Para probar el panel sin máquina: --fake');
      process.exit(1);
    }
    log('máquina:', dispositivos[0].split('\t')[0]);
  }
  await preparar();
  servidor.listen(CFG.http, () => log(`panel en http://localhost:${CFG.http}  (${CFG.fake ? 'fake' : CFG.puerto + ' @ ' + CFG.baud}, ${CFG.version})`));
}

for (const s of ['SIGINT', 'SIGTERM']) process.on(s, async () => { try { await apagar(); } catch {} process.exit(0); });
arrancar().catch((e) => { console.error('✗', e.message); process.exit(1); });
