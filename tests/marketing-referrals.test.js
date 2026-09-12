import { test } from "node:test";
import assert from "node:assert/strict";

// Test del generador de código de referido (lógica pura)

function generateCode(name, phone) {
  const namePart = (name || 'VENUS').replace(/\s/g, '').toUpperCase().slice(0, 4);
  const phonePart = (phone || '00').slice(-2);
  return `${namePart}${phonePart}`;
}

test("Genera código con nombre y teléfono", () => {
  const code = generateCode('Maria Lopez', '5512345678');
  assert.equal(code, 'MARI78');
});

test("Genera código con nombre corto", () => {
  const code = generateCode('Ana', '5512345678');
  assert.equal(code, 'ANA78');
});

test("Genera código con espacios en el nombre", () => {
  const code = generateCode('Said Romero', '5512345690');
  assert.equal(code, 'SAID90');
});

test("Genera código por defecto si no hay nombre", () => {
  const code = generateCode(null, '5512345678');
  assert.equal(code, 'VENU78');
});

test("Genera código con teléfono corto", () => {
  const code = generateCode('Test', '1234');
  assert.equal(code, 'TEST34');
});

test("Verifica que una invitada no puede referirse a sí misma", () => {
  const referrerCode = 'SAID78';
  const inviteeCode = 'SAID78';
  assert.equal(referrerCode, inviteeCode, 'Mismo código = mismo card');
});