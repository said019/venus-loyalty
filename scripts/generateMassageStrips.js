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
  stampCount: 10,
  stampsPerRow: 5,
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

// Verde Venus (mismo que la tarjeta de lealtad)
const VENUS_GREEN = '#9A9F82';

// Posiciones con regalo (1-indexed: 5 y 10 → 0-indexed: 4 y 9)
const GIFT_POSITIONS = [4, 9];
const GIFT_COLOR = '#FFD700'; // Dorado para regalos

function drawGiftIcon(ctx, x, y, size) {
  const s = size * 0.5; // tamaño del ícono de regalo relativo al stamp
  // Caja del regalo
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x - s/2, y - s/4, s, s * 0.55);
  // Tapa del regalo
  ctx.fillRect(x - s/2 - s*0.08, y - s/4 - s*0.18, s + s*0.16, s * 0.22);
  // Moño vertical
  ctx.fillStyle = GIFT_COLOR;
  ctx.fillRect(x - s*0.08, y - s/4, s*0.16, s * 0.55);
  // Moño horizontal
  ctx.fillRect(x - s/2, y - s/4 + s*0.18, s, s*0.16);
  // Lazo arriba
  ctx.beginPath();
  ctx.arc(x - s*0.15, y - s/4 - s*0.12, s*0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + s*0.15, y - s/4 - s*0.12, s*0.14, 0, Math.PI * 2);
  ctx.fill();
}

function applyStampEffect(ctx, img, x, y, size, isActive, stampIndex) {
  const isGift = GIFT_POSITIONS.includes(stampIndex);
  ctx.save();
  if (isActive) {
    // Sesión activa: círculo relleno + ícono blanco encima
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;

    // Relleno: dorado para posiciones de regalo, verde Venus para el resto
    ctx.beginPath();
    ctx.arc(x, y, size / 2 + 2, 0, Math.PI * 2);
    ctx.fillStyle = isGift ? GIFT_COLOR : VENUS_GREEN;
    ctx.fill();
    ctx.restore();

    // Ícono blanco encima (regalo o masaje)
    ctx.save();
    ctx.globalAlpha = 1.0;
    if (isGift) {
      drawGiftIcon(ctx, x, y, size);
    } else {
      ctx.filter = 'brightness(0) invert(1)';
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    }
  } else {
    // Sesión pendiente
    ctx.globalAlpha = 0.55;

    if (isGift) {
      // Borde dorado punteado para posiciones de regalo
      ctx.beginPath();
      ctx.arc(x, y, size / 2 + 3, 0, Math.PI * 2);
      ctx.strokeStyle = GIFT_COLOR;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ícono de regalo semi-transparente
      ctx.globalAlpha = 0.4;
      drawGiftIcon(ctx, x, y, size);
    } else {
      // Borde verde Venus
      ctx.beginPath();
      ctx.arc(x, y, size / 2 + 3, 0, Math.PI * 2);
      ctx.strokeStyle = VENUS_GREEN;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Ícono tintado en verde Venus (semi-transparente)
      ctx.filter = 'brightness(0) saturate(100%) invert(66%) sepia(20%) saturate(300%) hue-rotate(50deg)';
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    }
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
    applyStampEffect(ctx, logoImage, x, y, stampSize, isActive, i);
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
    console.log('   - massage-strip-0.png … massage-strip-10.png (1x)');
    console.log('   - massage-strip-0@2x.png … massage-strip-10@2x.png (2x)');
    console.log('\n💡 Ahora ejecuta: git add public/assets/ && git push');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

generateAllMassageStrips();
