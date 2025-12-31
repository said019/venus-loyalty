// lib/repo.js
import { firestore } from "../src/db/compat.js";

const cardsCol  = firestore.collection("cards");
const eventsCol = firestore.collection("events");

// ---- CARDS ----
export async function createCard({ id, name, max }) {
  const now = new Date().toISOString();
  await cardsCol.doc(id).set({
    id,
    name,
    max,
    stamps: 0,
    status: "active",
    created_at: now,
  });
}

export async function getCardById(id) {
  const snap = await cardsCol.doc(id).get();
  if (!snap.exists) return null;
  return snap.data();
}

export async function updateCardStamps(id, stamps) {
  await cardsCol.doc(id).update({ stamps });
}

export async function listCards({ q = "", page = 1, limit = 12 }) {
  // Para pocos clientes basta traer los últimos N y filtrar en memoria
  const snap = await cardsCol
    .orderBy("created_at", "desc")
    .limit(200)
    .get();

  const all = snap.docs.map((d) => d.data());
  const qLower = q.trim().toLowerCase();

  const filtered = qLower
    ? all.filter(
        (c) =>
          c.id.toLowerCase().includes(qLower) ||
          (c.name || "").toLowerCase().includes(qLower)
      )
    : all;

  const total = filtered.length;
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { items, page, totalPages, total };
}

// ---- EVENTS ----
export async function logEvent(cardId, type, meta = {}) {
  await eventsCol.add({
    card_id: cardId,
    type,
    meta: JSON.stringify(meta),
    created_at: new Date().toISOString(),
  });
}

export async function listEventsByCard(cardId) {
  const snap = await eventsCol
    .where("card_id", "==", cardId)
    .orderBy("created_at", "desc")
    .get();

  return snap.docs.map((d) => ({
    id: d.id,
    type: d.get("type"),
    meta: d.get("meta"),
    created_at: d.get("created_at"),
  }));
}

// ---- MÉTRICAS ----
export async function getMetricsToday() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const cardsSnap = await cardsCol.get();
  const cards = cardsSnap.docs.map((d) => d.data());
  const total = cards.length;
  const full = cards.filter((c) => (c.stamps || 0) >= (c.max || 0)).length;

  const evSnap = await eventsCol.get();
  const events = evSnap.docs.map((d) => d.data());

  const todayEvents = events.filter((e) =>
    (e.created_at || "").startsWith(today)
  );

  const counts = { STAMP: 0, REDEEM: 0 };
  for (const ev of todayEvents) {
    if (ev.type === "STAMP") counts.STAMP++;
    if (ev.type === "REDEEM") counts.REDEEM++;
  }

  return {
    total,
    full,
    stampsToday: counts.STAMP,
    redeemsToday: counts.REDEEM,
  };
}