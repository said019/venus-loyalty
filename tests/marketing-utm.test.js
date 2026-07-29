import { test } from "node:test";
import assert from "node:assert/strict";

// Test de captura de UTMs y ref params en agendar.html (lógica del frontend)

function parseAttributionParams(search) {
  const params = new URLSearchParams(search);
  const refCode = params.get('ref');
  const utmSource = params.get('utm_source');
  const utmCampaign = params.get('utm_campaign');
  const utmMedium = params.get('utm_medium');

  const result = {};
  if (refCode) result.refCode = refCode;
  if (utmSource || utmCampaign || utmMedium) {
    result.utm = {};
    if (utmSource) result.utm.source = utmSource;
    if (utmCampaign) result.utm.campaign = utmCampaign;
    if (utmMedium) result.utm.medium = utmMedium;
  }
  return result;
}

test("URL sin params = objeto vacío", () => {
  const result = parseAttributionParams('');
  assert.deepEqual(result, {});
});

test("URL con ref code = { refCode: 'SAID78' }", () => {
  const result = parseAttributionParams('?ref=SAID78');
  assert.equal(result.refCode, 'SAID78');
  assert.equal(result.utm, undefined);
});

test("URL con UTMs = { utm: { source, campaign, medium } }", () => {
  const result = parseAttributionParams('?utm_source=instagram&utm_campaign=piel-grasa-jul&utm_medium=social');
  assert.equal(result.utm.source, 'instagram');
  assert.equal(result.utm.campaign, 'piel-grasa-jul');
  assert.equal(result.utm.medium, 'social');
});

test("URL con ref + UTMs = ambos", () => {
  const result = parseAttributionParams('?ref=SAID78&utm_source=facebook-ads');
  assert.equal(result.refCode, 'SAID78');
  assert.equal(result.utm.source, 'facebook-ads');
});

test("URL con UTM parcial = solo los presentes", () => {
  const result = parseAttributionParams('?utm_source=google');
  assert.equal(result.utm.source, 'google');
  assert.equal(result.utm.campaign, undefined);
  assert.equal(result.utm.medium, undefined);
});