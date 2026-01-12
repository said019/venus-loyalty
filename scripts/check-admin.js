import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function checkAndCreateAdmin() {
  try {
    console.log('🔍 Verificando admins en PostgreSQL...');
    
    const adminCount = await db.admin.count();
    console.log(`📊 Admins encontrados: ${adminCount}`);
    
    if (adminCount === 0) {
      console.log('⚠️  No hay admins. Creando admin por defecto...');
      
      const email = 'admin@venus.com';
      const password = 'admin123';
      const pass_hash = await bcrypt.hash(password, 10);
      
      const admin = await db.admin.create({
        data: {
          email,
          pass_hash,
        }
      });
      
      console.log('✅ Admin creado:');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${password}`);
      console.log(`   ID: ${admin.id}`);
    } else {
      console.log('✅ Ya existen admins en la base de datos');
      const admins = await db.admin.findMany({
        select: { id: true, email: true, createdAt: true }
      });
      
      console.log('📋 Lista de admins:');
      admins.forEach(admin => {
        console.log(`   • ${admin.email} (ID: ${admin.id})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.$disconnect();
  }
}

checkAndCreateAdmin();