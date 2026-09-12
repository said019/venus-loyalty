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

test("signAdmin incluye role 'marketing' en el payload", () => {
  const token = signAdmin({ id: "m1", email: "marketing@venus.com", role: "marketing" });
  const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
  assert.equal(decoded.role, "marketing");
});

test("requireRole('marketing') permite si el rol es marketing", () => {
  const mw = requireRole("marketing");
  const req = { admin: { role: "marketing" } };
  const res = mockRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.equal(called, true);
});

test("requireRole('marketing') bloquea si el rol es admin", () => {
  const mw = requireRole("marketing");
  const req = { admin: { role: "admin" } };
  const res = mockRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res._status, 403);
});

test("requireRole('marketing', 'admin') permite ambos roles", () => {
  const mw = requireRole("marketing", "admin");
  const req1 = { admin: { role: "marketing" } };
  const req2 = { admin: { role: "admin" } };
  const res = mockRes();
  let called1 = false, called2 = false;
  mw(req1, res, () => { called1 = true; });
  mw(req2, res, () => { called2 = true; });
  assert.equal(called1, true);
  assert.equal(called2, true);
});

test("requireRole('admin') bloquea si el rol es marketing", () => {
  const mw = requireRole("admin");
  const req = { admin: { role: "marketing" } };
  const res = mockRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res._status, 403);
});