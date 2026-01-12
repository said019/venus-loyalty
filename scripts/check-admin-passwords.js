import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function checkAdminPasswords() {
  try {
    console.log('🔍 Verificando contraseñas de admins...');
    
    const admins = await db.admin.findMany({
      select: { id: true, email: true, pass_hash: true }
    });
    
    console.log('📋 Estado de contraseñas:');
    for (const admin of admins) {
      const hasPassword = admin.pass_hash && admin.pass_hash.length > 0;
      console.log(`   • ${admin.email}: ${hasPassword ? '✅ Tiene contraseña' : '❌ Sin contraseña'}`);
      
      if (!hasPassword) {
        console.log(`     🔧 Configurando contraseña por defecto para ${admin.email}...`);
        const defaultPassword = 'admin123';
        const pass_hash = await bcrypt.hash(defaultPassword, 10);
        
        await db.admin.update({
          where: { id: admin.id },
          data: { pass_hash }
        });
        
        console.log(`     ✅ Contraseña configurada: ${defaultPassword}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.$disconnect();
  }
}

checkAdminPasswords();