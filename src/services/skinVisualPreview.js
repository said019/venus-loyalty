import sharp from 'sharp';

export const VISUAL_MODES = Object.freeze(['red_contrast', 'brown_contrast', 'detail']);
export const VISUAL_NOTICE = 'Visualización de contraste, no medición clínica ni mapa del fabricante. No se usa para generar la valoración.';

// Deterministic display transforms. These do not estimate chromophores or lesions.
export async function createVisualPreview(bytes, mode) {
  if (!VISUAL_MODES.includes(mode)) throw new TypeError('Invalid visual mode');
  if (!Buffer.isBuffer(bytes) || bytes.length > 5 * 1024 * 1024) throw new TypeError('Invalid photo');
  const base = await sharp(bytes, { limitInputPixels: 24_000_000, animated: false })
    .rotate().resize({ width: 960, height: 1280, fit: 'inside', withoutEnlargement: true })
    .removeAlpha().toColourspace('srgb').png().toBuffer();
  let preview = sharp(base);
  if (mode === 'red_contrast') {
    preview = preview.recomb([[1, -0.5, -0.5], [1, -0.5, -0.5], [1, -0.5, -0.5]])
      .normalise().tint({ r: 179, g: 70, b: 88 });
  } else if (mode === 'brown_contrast') {
    preview = preview.greyscale().normalise().tint({ r: 135, g: 92, b: 56 });
  } else preview = preview.sharpen({ sigma: 0.7 });
  const image = await preview.jpeg({ quality: 88 }).toBuffer();
  return { dataUrl: 'data:image/jpeg;base64,' + image.toString('base64'), mode,
    notice: VISUAL_NOTICE, method: 'venus-display-contrast-v1' };
}
