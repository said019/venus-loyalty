// fix-lastvisit-simple.js
// Script simple para corregir el campo lastVisit usando el endpoint del servidor

const BASE_URL = 'http://localhost:3000';

async function fixLastVisit() {
    try {
        console.log('🔧 Corrigiendo campo lastVisit en tarjetas...\n');
        console.log('⚠️  Necesitas estar autenticado como admin\n');
        console.log('Ejecuta este comando en la consola del navegador (F12) cuando estés en el dashboard:\n');
        console.log('========================================\n');
        
        const code = `
fetch('/api/admin/fix-lastvisit', {
    method: 'POST',
    credentials: 'include'
})
.then(res => res.json())
.then(data => {
    console.log('\\n📊 Resultado:');
    console.log('   Total de tarjetas:', data.total);
    console.log('   Ya tenían lastVisit:', data.alreadyHave);
    console.log('   Corregidas:', data.fixed);
    console.log('   Sin fecha:', data.noDate);
    
    if (data.fixed > 0) {
        console.log('\\n✅ Se actualizaron', data.fixed, 'tarjetas');
        console.log('💡 Refresca la página (Ctrl+F5) para ver los cambios');
    } else {
        console.log('\\n✅ Todas las tarjetas ya tienen el campo lastVisit');
    }
})
.catch(err => console.error('❌ Error:', err));
`;
        
        console.log(code);
        console.log('\n========================================\n');
        console.log('📋 Instrucciones:');
        console.log('1. Abre el dashboard: http://localhost:3000/admin');
        console.log('2. Presiona F12 para abrir la consola');
        console.log('3. Copia y pega el código de arriba');
        console.log('4. Presiona Enter');
        console.log('5. Espera el resultado');
        console.log('6. Refresca la página (Ctrl+F5)\n');
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

fixLastVisit();
