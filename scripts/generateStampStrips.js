// scripts/generateStampStrips.js
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

// Configuración
const CONFIG = {
  width: 375,          // 375px EXACTO para iPhone
  height: 120,         // Ajustado para 2 filas
  stampCount: 8,       // Total de sellos
  stampsPerRow: 4,     // 4 sellos por fila
  bgColor: '#E8E4D0',  // Fondo crema/beige
  logoPath: 'public/assets/stamp.png', // Ruta a tu logo Venus
  stampSize: 40,       // Tamaño de cada sello
  paddingX: 20,        // Espacio lateral
  paddingY: 10,        // Espacio vertical
  spacingX: 15,        // Espacio horizontal entre sellos
  spacingY: 10,        // Espacio vertical entre filas
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
  
  // Calcular distribución de sellos (2 filas de 4)
  const stampsPerRow = CONFIG.stampsPerRow;
  const rows = Math.ceil(CONFIG.stampCount / stampsPerRow);
  
  // Calcular ancho disponible para una fila
  const availableWidth = CONFIG.width - (CONFIG.paddingX * 2);
  const totalSpacingX = CONFIG.spacingX * (stampsPerRow - 1);
  const stampSize = Math.min(
    CONFIG.stampSize,
    (availableWidth - totalSpacingX) / stampsPerRow
  );
  
  // Calcular inicio X para centrar la fila
  const totalRowWidth = (stampSize * stampsPerRow) + (CONFIG.spacingX * (stampsPerRow - 1));
  const startX = (CONFIG.width - totalRowWidth) / 2;
  
  // Calcular posiciones Y para las dos filas
  const totalHeight = (stampSize * rows) + (CONFIG.spacingY * (rows - 1));
  const startY = (CONFIG.height - totalHeight) / 2;
  
  // Dibujar cada sello
  for (let i = 0; i < CONFIG.stampCount; i++) {
    const isActive = i < activeStamps;
    
    // Calcular fila y columna
    const row = Math.floor(i / stampsPerRow);
    const col = i % stampsPerRow;
    
    // Posición X e Y
    const x = startX + (col * (stampSize + CONFIG.spacingX)) + (stampSize / 2);
    const y = startY + (row * (stampSize + CONFIG.spacingY)) + (stampSize / 2);
    
    // Aplicar efecto según estado
    applyStampEffect(ctx, logoImage, x, y, stampSize, isActive);
    
    // Borde circular sutil para sellos inactivos (opcional)
    if (!isActive) {
      ctx.save();
      ctx.strokeStyle = 'rgba(150, 150, 150, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, stampSize / 2 + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  
  // Guardar imagen
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  
  const activeText = activeStamps === 0 ? 'sin sellos' : 
                     activeStamps === CONFIG.stampCount ? 'completo ✨' : 
                     `${activeStamps}/${CONFIG.stampCount} sellos`;
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
    
    // ============= VERSIÓN 1x (375x120px) =============
    console.log('🎨 Generando strips 1x (375x120px - 2 filas)...\n');
    
    for (let i = 0; i <= CONFIG.stampCount; i++) {
      const filename = `stamp-strip-${i}.png`;
      const filepath = path.join(outputDir, filename);
      await generateStripImage(logoImage, i, filepath);
    }
    
    console.log('\n✅ Versiones 1x generadas\n');
    
    // ============= VERSIÓN 2x (750x240px) =============
    console.log('🎨 Generando strips @2x (750x240px para Retina)...\n');
    
    // Guardar configuración original
    const originalWidth = CONFIG.width;
    const originalHeight = CONFIG.height;
    const originalStampSize = CONFIG.stampSize;
    const originalPaddingX = CONFIG.paddingX;
    const originalPaddingY = CONFIG.paddingY;
    const originalSpacingX = CONFIG.spacingX;
    const originalSpacingY = CONFIG.spacingY;
    
    // Duplicar tamaños para versión @2x
    CONFIG.width = 750;
    CONFIG.height = 240;   // 120px * 2
    CONFIG.stampSize = 80; // 40px * 2
    CONFIG.paddingX = 40;  // 20px * 2
    CONFIG.paddingY = 20;  // 10px * 2
    CONFIG.spacingX = 30;  // 15px * 2
    CONFIG.spacingY = 20;  // 10px * 2
    
    for (let i = 0; i <= CONFIG.stampCount; i++) {
      const filename = `stamp-strip-${i}@2x.png`;
      const filepath = path.join(outputDir, filename);
      await generateStripImage(logoImage, i, filepath);
    }
    
    // Restaurar configuración original
    CONFIG.width = originalWidth;
    CONFIG.height = originalHeight;
    CONFIG.stampSize = originalStampSize;
    CONFIG.paddingX = originalPaddingX;
    CONFIG.paddingY = originalPaddingY;
    CONFIG.spacingX = originalSpacingX;
    CONFIG.spacingY = originalSpacingY;
    
    console.log('\n✅ Versiones @2x generadas\n');
    
    // ============= RESUMEN =============
    console.log(`✅ ¡Listo! Se generaron ${(CONFIG.stampCount + 1) * 2} imágenes en: public/assets/`);
    console.log('   - 9 versiones 1x (375x120px) para pantallas normales');
    console.log('   - 9 versiones @2x (750x240px) para pantallas Retina\n');
    
    console.log('📋 Archivos creados:');
    for (let i = 0; i <= CONFIG.stampCount; i++) {
      const status = i === 0 ? 'sin sellos (todo gris)' : 
                     i <= 4 ? `fila superior: ${i} sellos` :
                     i === CONFIG.stampCount ? '¡completo! 🎉 (ambas filas)' : 
                     `ambas filas: ${i}/${CONFIG.stampCount} sellos`;
      console.log(`   - stamp-strip-${i}.png + @2x.png → ${status}`);
    }
    
    console.log('\n💡 Ahora reinicia tu servidor y genera un nuevo pase');
    console.log('💡 Layout: 2 filas × 4 columnas (más compacto)');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Ejecutar
generateAllStrips();