import prisma from '../src/db/index.js';

const products = [
  // BAGELS
  { name: 'Brisa Nórdica', category: 'bagels', price: 129, sortOrder: 1 },
  { name: 'Clásico Fundido', category: 'bagels', price: 89, sortOrder: 2 },
  { name: 'Rojo Horneado', category: 'bagels', price: 95, sortOrder: 3 },
  { name: 'Dulce Avellana', category: 'bagels', price: 92, sortOrder: 4 },

  // CAFÉ
  { name: 'Americano', category: 'cafe', price: 49, sortOrder: 1 },
  { name: 'Espresso', category: 'cafe', price: 42, sortOrder: 2 },
  { name: 'Latte', category: 'cafe', price: 69, sortOrder: 3 },
  { name: 'Moka', category: 'cafe', price: 76, sortOrder: 4 },
  { name: 'Frappé', category: 'cafe', price: 82, sortOrder: 5 },
  { name: 'Dirty Horchata', category: 'cafe', price: 78, sortOrder: 6 },
  { name: 'Chocolate Caliente', category: 'cafe', price: 68, sortOrder: 7 },

  // TÉ Y MATCHA
  { name: 'Té de la Casa', category: 'te_matcha', price: 45, sortOrder: 1 },
  { name: 'Matcha Latte', category: 'te_matcha', price: 84, sortOrder: 2 },
  { name: 'Matcha Nube', category: 'te_matcha', price: 92, sortOrder: 3 },

  // SMOOTHIES
  { name: 'Brisa Colada', category: 'smoothies', price: 92, sortOrder: 1 },
  { name: 'Sol Mango', category: 'smoothies', price: 89, sortOrder: 2 },
  { name: 'Cacao Nómada', category: 'smoothies', price: 92, sortOrder: 3 },
  { name: 'Costa Violeta', category: 'smoothies', price: 95, sortOrder: 4 },
  { name: 'Matcha Nube Smoothie', category: 'smoothies', price: 98, sortOrder: 5 },
  { name: 'Jardín Dorado', category: 'smoothies', price: 95, sortOrder: 6 },
];

async function main() {
  let created = 0;
  for (const p of products) {
    await prisma.coffeeProduct.create({
      data: {
        name: p.name,
        category: p.category,
        price: p.price,
        taxRate: 0.16,
        sortOrder: p.sortOrder,
      },
    });
    created++;
    process.stdout.write('.');
  }
  console.log(`\n${created} productos creados`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
