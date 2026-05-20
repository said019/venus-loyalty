// Namespace de endpoints machine-to-machine (Claude / MCP).
// Auth: middleware integrationAuth montado en server.js.
// Log: middleware integrationLogger montado en server.js.

import { Router } from "express";

const router = Router();

// Health check del namespace. Útil para confirmar end-to-end que la
// API key funciona y el server está vivo. version sube cuando cambia
// el contrato de los endpoints de integración.
router.get("/ping", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), version: "1" });
});

export default router;
