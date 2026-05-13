import { test } from "node:test";
import assert from "node:assert/strict";
import { requireRole, signAdmin } from "../lib/auth.js";
import jwt from "jsonwebtoken";

process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "test-secret";

function mockRes() {
  const res = {};
  res.status = (code) => { res._status = code; return res; };
  res.json = (body) => { res._body = body; return res; };
  return res;
}

test("signAdmin incluye role en el payload", () => {
  const token = signAdmin({ id: "a1", email: "x@y.z", role: "recepcion" });
  const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
  assert.equal(decoded.role, "recepcion");
});

test("signAdmin sin role usa 'admin' por defecto", () => {
  const token = signAdmin({ id: "a1", email: "x@y.z" });
  const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
  assert.equal(decoded.role, "admin");
});

test("requireRole bloquea si el rol no está en allowed", () => {
  const mw = requireRole("admin");
  const req = { admin: { role: "recepcion" } };
  const res = mockRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res._status, 403);
  assert.equal(res._body.error, "forbidden");
});

test("requireRole permite si el rol está en allowed", () => {
  const mw = requireRole("admin", "recepcion");
  const req = { admin: { role: "recepcion" } };
  const res = mockRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.equal(called, true);
});

test("requireRole bloquea si req.admin no existe", () => {
  const mw = requireRole("admin");
  const req = {};
  const res = mockRes();
  mw(req, res, () => {});
  assert.equal(res._status, 403);
});
