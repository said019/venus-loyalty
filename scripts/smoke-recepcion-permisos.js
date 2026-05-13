// scripts/smoke-recepcion-permisos.js
// Verifica el cuadro de permisos del rol recepción contra el servidor local.
// Uso: BASE=http://localhost:3000 RECEP_PASS=recepcion123 node scripts/smoke-recepcion-permisos.js

const BASE = process.env.BASE || "http://localhost:3000";
const EMAIL = "recepcion@venus.local";
const PASS = process.env.RECEP_PASS;
if (!PASS) { console.error("Falta RECEP_PASS"); process.exit(1); }

let cookie = "";

async function login() {
  const r = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (!r.ok) throw new Error(`login fail ${r.status}`);
  const setCookie = r.headers.get("set-cookie") || "";
  cookie = setCookie.split(";")[0];
  const body = await r.json();
  if (body.role !== "recepcion") {
    throw new Error(`role esperado recepcion, got ${body.role}`);
  }
  console.log("✓ login recepción");
}

async function expectStatus(method, path, expected, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ok = r.status === expected;
  console.log(`${ok ? "✓" : "✗"} ${method} ${path} -> ${r.status} (esperaba ${expected})`);
  if (!ok) process.exitCode = 1;
}

async function run() {
  await login();

  // Bloqueados (403)
  await expectStatus("GET", "/api/expenses", 403);
  await expectStatus("GET", "/api/admin/metrics-firebase", 403);
  await expectStatus("GET", "/api/admin/top-clients", 403);
  await expectStatus("GET", "/api/dashboard/today", 403);
  await expectStatus("GET", "/api/pos/cash/current", 403);
  await expectStatus("GET", "/api/pos/reports/daily", 403);
  await expectStatus("POST", "/api/services", 403, { name: "x", price: 1 });
  await expectStatus("POST", "/api/products", 403, { name: "x", price: 1 });
  await expectStatus("POST", "/api/direct-sales", 403, {
    productsSold: [{ productId: "fake", qty: 1 }],
    discountAmount: 50,
  });

  // Permitidos (200/2xx)
  await expectStatus("GET", "/api/services", 200);
  await expectStatus("GET", "/api/products", 200);
  await expectStatus("GET", "/api/appointments", 200);
  await expectStatus("GET", "/api/pos/products", 200);

  if (process.exitCode === 1) {
    console.error("\nFAIL: algún chequeo no cumplió la expectativa.");
    process.exit(1);
  }
  console.log("\nOK: permisos de recepción correctos.");
}

run().catch((e) => { console.error(e); process.exit(1); });
