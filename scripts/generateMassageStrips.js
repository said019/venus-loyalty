// scripts/generateMassageStrips.js
// Genera los stamp-strips para la membresía de masajes
// Usa stamp-massage.png como ícono y fondo color terracota cálido

import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

// Configuración para masajes (fondo terracota/warm)
const CONFIG = {
  width: 375,
  height: 120,
  stampCount: 8,
  stampsPerRow: 4,
  bgColor: '#C4936E',       // Terracota cálido
  logoPath: 'public/assets/stamp-massage.png',  // ← imagen de masaje (línea/outline)
  stampSize: 40,
  paddingX: 20,
  paddingY: 10,
  spacingX: 15,
  spacingY: 10,
};

function toGrayscale(ctx, img, x, y, size) {
  const tempCanvas = createCanvas(size, size);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(img, 0, 0, size, size);
  const imageData = tempCtx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  tempCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(tempCanvas, x - size / 2, y - size / 2, size, size);
}

function applyStampEffect(ctx, img, x, y, size, isActive) {
  ctx.save();
  if (isActive) {
    // Sello activo: blanco con sombra (para que resalte sobre fondo terracota)
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.globalAlpha = 1.0;
    // Tintado blanco sobre el ícono
    ctx.filter = 'brightness(0) invert(1)';
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  } else {
    // Sello inactivo: semi-transparente con filtro oscuro
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 0.35;
    ctx.filter = 'brightness(0) invert(1)';
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  }
  ctx.restore();
}

async function generateStripImage(logoImage, activeStamps, outputPath) {
  const canvas = createCanvas(CONFIG.width, CONFIG.height);
  const ctx = canvas.getContext('2d');

  // Fondo terracota
  ctx.fillStyle = CONFIG.bgColor;
  ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

  const stampsPerRow = CONFIG.stampsPerRow;
  const rows = Math.ceil(CONFIG.stampCount / stampsPerRow);
  const availableWidth = CONFIG.width - (CONFIG.paddingX * 2);
  const totalSpacingX = CONFIG.spacingX * (stampsPerRow - 1);
  const stampSize = Math.min(
    CONFIG.stampSize,
    (availableWidth - totalSpacingX) / stampsPerRow
  );
  const totalRowWidth = (stampSize * stampsPerRow) + (CONFIG.spacingX * (stampsPerRow - 1));
  const startX = (CONFIG.width - totalRowWidth) / 2;
  const totalHeight = (stampSize * rows) + (CONFIG.spacingY * (rows - 1));
  const startY = (CONFIG.height - totalHeight) / 2;

  for (let i = 0; i < CONFIG.stampCount; i++) {
    const isActive = i < activeStamps;
    const row = Math.floor(i / stampsPerRow);
    const col = i % stampsPerRow;
    const x = startX + (col * (stampSize + CONFIG.spacingX)) + (stampSize / 2);
    const y = startY + (row * (stampSize + CONFIG.spacingY)) + (stampSize / 2);
    applyStampEffect(ctx, logoImage, x, y, stampSize, isActive);

    if (!isActive) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, stampSize / 2 + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  const label = activeStamps === 0 ? 'vacío' :
    activeStamps === CONFIG.stampCount ? '¡completo! 🎉' :
    `${activeStamps}/${CONFIG.stampCount}`;
  console.log(`✓ massage-strip-${activeStamps}.png → ${label}`);
}

async function generateAllMassageStrips() {
  try {
    const logoPath = path.join(process.cwd(), CONFIG.logoPath);
    if (!fs.existsSync(logoPath)) {
      throw new Error(
        `❌ No se encontró la imagen de masaje en: ${logoPath}\n` +
        `   Por favor guarda el ícono de masaje como: public/assets/stamp-massage.png`
      );
    }

    console.log('🧘 Cargando imagen de masaje...');
    const logoImage = await loadImage(logoPath);
    console.log(`✓ Imagen cargada (${logoImage.width}x${logoImage.height}px)\n`);

    const outputDir = path.join(process.cwd(), 'public', 'assets');
    fs.mkdirSync(outputDir, { recursive: true });

    // ============= VERSIÓN 1x =============
    console.log('🎨 Generando strips 1x (375x120px)...\n');
    for (let i = 0; i <= CONFIG.stampCount; i++) {
      await generateStripImage(logoImage, i,
        path.join(outputDir, `massage-strip-${i}.png`));
    }

    // ============= VERSIÓN 2x =============
    console.log('\n🎨 Generando strips @2x (750x240px)...\n');
    const saved = { ...CONFIG };
    CONFIG.width = 750;
    CONFIG.height = 240;
    CONFIG.stampSize = 80;
    CONFIG.paddingX = 40;
    CONFIG.paddingY = 20;
    CONFIG.spacingX = 30;
    CONFIG.spacingY = 20;

    for (let i = 0; i <= CONFIG.stampCount; i++) {
      await generateStripImage(logoImage, i,
        path.join(outputDir, `massage-strip-${i}@2x.png`));
    }

    Object.assign(CONFIG, saved);

    console.log(`\n✅ ¡Listo! ${(CONFIG.stampCount + 1) * 2} imágenes en public/assets/`);
    console.log('   - massage-strip-0.png … massage-strip-8.png (1x)');
    console.log('   - massage-strip-0@2x.png … massage-strip-8@2x.png (2x)');
    console.log('\n💡 Ahora ejecuta: git add public/assets/ && git push');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

generateAllMassageStrips();
