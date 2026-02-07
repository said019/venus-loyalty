// Script para agregar el campo discount a la tabla services
import pg from 'pg';
const { Client } = pg;

async function addDiscountField() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    await client.connect();
    console.log('Conectado a la base de datos...');
    
    // Verificar si el campo ya existe
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'services' AND column_name = 'discount'
    `);
    
    if (result.rows.length > 0) {
      console.log('✓ El campo discount ya existe en la tabla services');
    } else {
      // Agregar el campo
      await client.query(`ALTER TABLE services ADD COLUMN discount TEXT`);
      console.log('✓ Campo discount agregado exitosamente');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

addDiscountField();
