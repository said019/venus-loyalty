#!/usr/bin/env node
// Reemplaza el menú de Venus The Coffee Bar con el menú oficial.
//
// Estrategia segura:
//   1. Desactiva (isActive=false) TODOS los productos actuales —
//      conservan su historial de ventas para reportes.
//   2. Crea los productos del menú nuevo (o reactiva si ya existían
//      con el mismo nombre+categoría, evitando duplicados).
//
// Café / Té / Matcha con precio Caliente y Frío se crean como DOS
// productos separados ("Americano Caliente" / "Americano Frío") porque
// el POS no soporta elegir variante al vender.
//
// Uso:  node scripts/seed-coffee-menu.js
//       node scripts/seed-coffee-menu.js --dry   (solo muestra, no escribe)

import 'dotenv/config';
import { prisma } from '../src/db/index.js';

const DRY = process.argv.includes('--dry');

// ── Menú oficial ────────────────────────────────────────────────
// category: smoothies | cafe | te_matcha | bagels
const MENU = [
  // ===== SMOOTHIES =====
  { category: 'smoothies', name: 'Tropical Venus', price: 129 },
  { category: 'smoothies', name: 'Mango Glow',     price: 89 },
  { category: 'smoothies', name: 'Cacao Power',    price: 92 },
  { category: 'smoothies', name: 'Costa Violeta',  price: 92 },
  { category: 'smoothies', name: 'Jardín Dorado',  price: 95 },

  // ===== CAFÉ (caliente / frío separados) =====
  { category: 'cafe', name: 'Americano Caliente',     price: 49 },
  { category: 'cafe', name: 'Americano Frío',         price: 55 },
  { category: 'cafe', name: 'Espresso',               price: 42 }, // solo caliente
  { category: 'cafe', name: 'Latte Cremoso Caliente', price: 69 },
  { category: 'cafe', name: 'Latte Cremoso Frío',     price: 75 },
  { category: 'cafe', name: 'Moka Caliente',          price: 76 },
  { category: 'cafe', name: 'Moka Frío',              price: 82 },
  { category: 'cafe', name: 'Frappé',                 price: 76 }, // frío por naturaleza, base
  { category: 'cafe', name: 'Dirty Horchata',         price: 78 }, // solo frío
  { category: 'cafe', name: 'Hot Cocoa Caliente',     price: 68 },
  { category: 'cafe', name: 'Hot Cocoa Frío',         price: 74 },

  // ===== TÉ & MATCHA (caliente / frío separados) =====
  { category: 'te_matcha', name: 'Té de la casa Caliente',         price: 45 },
  { category: 'te_matcha', name: 'Té de la casa Frío',             price: 50 },
  { category: 'te_matcha', name: 'Tisana de frutos rojos Caliente', price: 52 },
  { category: 'te_matcha', name: 'Tisana de frutos rojos Frío',     price: 58 },
  { category: 'te_matcha', name: 'Matcha Latte Caliente',          price: 84 },
  { category: 'te_matcha', name: 'Matcha Latte Frío',              price: 90 },

  // ===== BAGELS =====
  { category: 'bagels', name: 'Nordic Glow',     price: 129 },
  { category: 'bagels', name: 'Bagel Clásico',   price: 89 },
  { category: 'bagels', name: 'Bagel Pepperoni', price: 95 },
  { category: 'bagels', name: 'Sweet Balance',   price: 92 },
];

// Variantes de leche vegetal (+$8) — aplican a TODAS las bebidas
// (café, té/matcha, smoothies). No a bagels.
const MILK_VARIANTS = [
  { name: 'Leche de avena',    type: 'extra', priceAdj: 8 },
  { name: 'Leche de coco',     type: 'extra', priceAdj: 8 },
  { name: 'Leche de almendra', type: 'extra', priceAdj: 8 },
];
const BEVERAGE_CATEGORIES = new Set(['cafe', 'te_matcha', 'smoothies']);

async function main() {
  console.log(`\n=== Seed Venus Coffee Bar ${DRY ? '(DRY RUN)' : ''} ===\n`);

  const existing = await prisma.coffeeProduct.findMany();
  console.log(`Productos actuales en BD: ${existing.length}`);

  // 1. Desactivar todos los actuales
  if (!DRY) {
    const deact = await prisma.coffeeProduct.updateMany({
      data: { isActive: false },
    });
    console.log(`✓ Desactivados ${deact.count} productos viejos (historial conservado)`);
  } else {
    console.log(`(dry) Desactivaría ${existing.length} productos`);
  }

  // 2. Crear / reactivar los del menú nuevo
  let created = 0, reactivated = 0, variantsAdded = 0;
  const byKey = new Map(existing.map(p => [`${p.category}|${p.name.toLowerCase()}`, p]));

  // Helper: deja exactamente las MILK_VARIANTS en el producto (idempotente)
  async function syncMilkVariants(productId, productName) {
    if (DRY) return MILK_VARIANTS.length;
    // Borra variantes 'extra' de leche existentes para evitar duplicados en re-runs
    await prisma.coffeeProductVariant.deleteMany({
      where: { productId, name: { in: MILK_VARIANTS.map(v => v.name) } },
    });
    for (const v of MILK_VARIANTS) {
      await prisma.coffeeProductVariant.create({
        data: { productId, name: v.name, type: v.type, priceAdj: v.priceAdj, isActive: true },
      });
    }
    return MILK_VARIANTS.length;
  }

  let sort = 0;
  for (const item of MENU) {
    sort += 1;
    const key = `${item.category}|${item.name.toLowerCase()}`;
    const match = byKey.get(key);
    const isBeverage = BEVERAGE_CATEGORIES.has(item.category);
    let productId = match?.id;

    if (match) {
      // Ya existía: reactivar + actualizar precio/orden
      if (!DRY) {
        await prisma.coffeeProduct.update({
          where: { id: match.id },
          data: { price: item.price, isActive: true, sortOrder: sort },
        });
      }
      reactivated += 1;
      console.log(`  ↻ ${item.name} ($${item.price}) — reactivado`);
    } else {
      if (!DRY) {
        const p = await prisma.coffeeProduct.create({
          data: {
            name: item.name,
            category: item.category,
            price: item.price,
            taxRate: 0.16,
            isActive: true,
            sortOrder: sort,
          },
        });
        productId = p.id;
      }
      created += 1;
      console.log(`  + ${item.name} ($${item.price}) — nuevo`);
    }

    // Variantes de leche vegetal solo en bebidas
    if (isBeverage && productId) {
      const n = await syncMilkVariants(productId, item.name);
      variantsAdded += n;
      console.log(`      └ +${n} leches vegetales (+$8)`);
    }
  }

  console.log(`\n=== Resumen ===`);
  console.log(`Nuevos creados:   ${created}`);
  console.log(`Reactivados:      ${reactivated}`);
  console.log(`Variantes leche:  ${variantsAdded}`);
  console.log(`Total en menú:    ${MENU.length}`);
  if (DRY) console.log(`\n(DRY RUN — no se escribió nada. Corre sin --dry para aplicar.)`);
}

main()
  .catch(e => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
