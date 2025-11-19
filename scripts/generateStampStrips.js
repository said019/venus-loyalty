// scripts/generateStampStrips.js
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

// Configuración
const CONFIG = {
  width: 375,          // 375px EXACTO para iPhone (no 750)
  height: 123,         // 123px EXACTO para iPhone (no 246)
  stampCount: 8,       // Total de sellos
  bgColor: '#E8E4D0',  // Fondo crema/beige
  logoPath: 'public/assets/stamp.png', // Ruta a tu logo Venus
  stampSize: 45,       // Tamaño de cada sello (ajustado para 375px)
  padding: 20,         // Espacio lateral
  spacing: 8,          // Espacio entre sellos
};

// Función para convertir imagen a escala de grises
function toGrayscale(ctx, img, x, y, size) {
  // Crear canvas temporal para manipular la imagen
  const tempCanvas = createCanvas(size, size);
  const tempCtx = tempCanvas.getContext('2d');
  
  // Dibujar imagen original en canvas temporal
  tempCtx.drawImage(img, 0, 0, size, size);
  
  // Obtener datos de píxeles
  const imageData = tempCtx.getImageData(0, 0, size, size);
  const data = imageData.data;
  
  // Convertir a escala de grises
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = gray;       // R
    data[i + 1] = gray;   // G
    data[i + 2] = gray;   // B
    // data[i + 3] mantiene el alpha
  }
  
  // Poner los datos modificados de vuelta
  tempCtx.putImageData(imageData, 0, 0);
  
  // Dibujar en el canvas principal
  ctx.drawImage(tempCanvas, x - size / 2, y - size / 2, size, size);
}

// Función para aplicar efecto de sello activo/inactivo
function applyStampEffect(ctx, img, x, y, size, isActive) {
  ctx.save();
  
  if (isActive) {
    // Sello activo: COLOR ORIGINAL con sombra
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.globalAlpha = 1.0;
    
    // Dibujar logo en color original
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  } else {
    // Sello inactivo: ESCALA DE GRISES con opacidad reducida
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 0.4; // Más transparente
    
    // Dibujar logo en escala de grises
    toGrayscale(ctx, img, x, y, size);
  }
  
  ctx.restore();
}

// Generar una imagen de strip
async function generateStripImage(logoImage, activeStamps, outputPath) {
  const canvas = createCanvas(CONFIG.width, CONFIG.height);
  const ctx = canvas.getContext('2d');
  
  // Fondo
  ctx.fillStyle = CONFIG.bgColor;
  ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
  
  // Calcular distribución de sellos
  const totalStamps = CONFIG.stampCount;
  const availableWidth = CONFIG.width - (CONFIG.padding * 2);
  const totalSpacing = CONFIG.spacing * (totalStamps - 1);
  const stampSize = Math.min(
    CONFIG.stampSize,
    (availableWidth - totalSpacing) / totalStamps
  );
  
  // Centrar verticalmente
  const centerY = CONFIG.height / 2;
  
  // Calcular inicio para centrar horizontalmente
  const totalWidth = (stampSize * totalStamps) + (CONFIG.spacing * (totalStamps - 1));
  const startX = (CONFIG.width - totalWidth) / 2;
  
  // Dibujar cada sello
  for (let i = 0; i < totalStamps; i++) {
    const isActive = i < activeStamps;
    const x = startX + (i * (stampSize + CONFIG.spacing)) + (stampSize / 2);
    
    // Aplicar efecto según estado
    applyStampEffect(ctx, logoImage, x, centerY, stampSize, isActive);
    
    // Borde circular sutil para sellos inactivos
    if (!isActive) {
      ctx.save();
      ctx.strokeStyle = '#A5A89D';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(x, centerY, stampSize / 2 + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  
  // Guardar imagen
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  
  const activeText = activeStamps === 0 ? 'sin sellos' : 
                     activeStamps === totalStamps ? 'completo ✨' : 
                     `${activeStamps}/${totalStamps} sellos`;
  console.log(`✓ stamp-strip-${activeStamps}.png → ${activeText}`);
}

// Generar todas las imágenes (0 a 8 sellos)
async function generateAllStrips() {
  try {
    // Verificar que existe el logo
    const logoPath = path.join(process.cwd(), CONFIG.logoPath);
    if (!fs.existsSync(logoPath)) {
      throw new Error(`❌ No se encontró el logo en: ${logoPath}\n   Por favor, asegúrate de que existe public/assets/logo.png`);
    }
    
    console.log('🎨 Cargando logo Venus...');
    const logoImage = await loadImage(logoPath);
    console.log(`✓ Logo cargado (${logoImage.width}x${logoImage.height}px)\n`);
    
    // Crear directorio de salida
    const outputDir = path.join(process.cwd(), 'public', 'assets');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    console.log('🎨 Generando strips de sellos...\n');
    
    // Generar imagen para cada estado (0-8 sellos activos)
    // Generar SOLO versión 1x (375x123px) - Apple Wallet la escala automáticamente
    for (let i = 0; i <= CONFIG.stampCount; i++) {
      const filename = `stamp-strip-${i}.png`;
      const filepath = path.join(outputDir, filename);
      await generateStripImage(logoImage, i, filepath);
    }
    
    console.log(`\n✅ ¡Listo! Se generaron ${CONFIG.stampCount + 1} strips en: public/assets/`);
    console.log(`   Dimensiones: ${CONFIG.width}x${CONFIG.height}px (exactas para iPhone)\n`);
    console.log('📋 Archivos creados:');
    console.log('   stamp-strip-0.png  (sin sellos)');
    for (let i = 1; i < CONFIG.stampCount; i++) {
      console.log(`   stamp-strip-${i}.png  (${i}/${CONFIG.stampCount} sellos)`);
    }
    console.log(`   stamp-strip-${CONFIG.stampCount}.png  (¡completo! 🎉)\n`);
    
    console.log('💡 Tip: Apple Wallet escala automáticamente para Retina');
    console.log('💡 Si quieres @2x, cambia CONFIG.width a 750 y CONFIG.height a 246');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Ejecutar
generateAllStrips();