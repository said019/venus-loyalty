// fix-lastvisit-api.js
// Script para corregir el campo lastVisit usando la API del servidor

const BASE_URL = 'http://localhost:3000';

async function login() {
    // Necesitarás las credenciales de admin
    console.log('⚠️  Este script requiere credenciales de admin');
    console.log('Por favor, ejecuta este código desde la consola del navegador en el dashboard:\n');
    
    const code = `
// ========================================
// SCRIPT PARA CORREGIR CAMPO lastVisit
// ========================================
// Ejecutar en la consola del navegador (F12) cuando estés en el dashboard

(async function fixLastVisit() {
    try {
        console.log('🔍 Obteniendo todas las tarjetas...');
        
        // Obtener todas las tarjetas
        const response = await fetch('/api/admin/cards-firebase?page=1&q=&sort=createdAt&order=desc', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Error obteniendo tarjetas: ' + response.status);
        }
        
        const data = await response.json();
        console.log(\`📊 Total de tarjetas: \${data.total}\`);
        
        // Obtener todas las páginas
        let allCards = [...data.items];
        for (let page = 2; page <= data.totalPages; page++) {
            const pageResponse = await fetch(\`/api/admin/cards-firebase?page=\${page}&q=&sort=createdAt&order=desc\`, {
                credentials: 'include'
            });
            const pageData = await pageResponse.json();
            allCards = [...allCards, ...pageData.items];
        }
        
        console.log(\`✅ Obtenidas \${allCards.length} tarjetas\`);
        console.log('\\n📋 Analizando campos lastVisit...\\n');
        
        let withLastVisit = 0;
        let withoutLastVisit = 0;
        let needsUpdate = [];
        
        allCards.forEach(card => {
            if (card.lastVisit) {
                withLastVisit++;
                console.log(\`✅ \${card.name}: tiene lastVisit = \${card.lastVisit}\`);
            } else {
                withoutLastVisit++;
                const fallback = card.updatedAt || card.createdAt;
                console.log(\`⚠️  \${card.name}: SIN lastVisit (usaría: \${fallback})\`);
                needsUpdate.push({
                    id: card.id,
                    name: card.name,
                    fallback: fallback
                });
            }
        });
        
        console.log(\`\\n📊 Resumen:\`);
        console.log(\`   Total: \${allCards.length}\`);
        console.log(\`   Con lastVisit: \${withLastVisit}\`);
        console.log(\`   Sin lastVisit: \${withoutLastVisit}\`);
        
        if (needsUpdate.length > 0) {
            console.log(\`\\n⚠️  Hay \${needsUpdate.length} tarjetas que necesitan actualización\`);
            console.log('\\n💡 Para corregirlas, necesitas ejecutar este código en el servidor:');
            console.log('\\nconst { firestore } = require("./lib/firebase.js");');
            console.log('\\nasync function fix() {');
            needsUpdate.forEach(card => {
                console.log(\`  await firestore.collection('cards').doc('\${card.id}').update({ lastVisit: '\${card.fallback}' });\`);
            });
            console.log('}');
            console.log('fix();');
        } else {
            console.log('\\n✅ Todas las tarjetas ya tienen el campo lastVisit');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
})();
`;

    console.log(code);
    console.log('\n========================================\n');
}

login();
