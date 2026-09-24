import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const runner = fileURLToPath(new URL('../../tools/skin-layers/run.py', import.meta.url));
const allowed = ['poros', 'textura', 'manchas', 'lesiones', 'zonas_rojas', 'brillo'];
const error = code => Object.assign(new Error(code), { code });

function execute(python, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { detached: true, stdio: 'ignore', shell: false });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
    }, 195_000);
    child.once('error', () => { clearTimeout(timer); reject(error('layers_unavailable')); });
    child.once('close', code => {
      clearTimeout(timer);
      if (timedOut || code !== 0) reject(error(timedOut ? 'layers_timeout' : 'layers_failed'));
      else resolve();
    });
  });
}

export function createSkinLayersEngine({ python = process.env.SKIN_LAYERS_PYTHON, run = execute } = {}) {
  let busy = false;
  return Object.freeze({
    enabled: Boolean(python),
    async generate(bytes) {
      if (!python) throw error('layers_disabled');
      if (busy) throw error('layers_busy');
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5 * 1024 * 1024) throw error('invalid_photo');
      busy = true;
      let directory;
      try {
        // Decode and orient once, without reducing the detection resolution.
        const original = await sharp(bytes, { limitInputPixels: 24_000_000 }).rotate().removeAlpha().png().toBuffer();
        directory = await mkdtemp(join(tmpdir(), 'venus-skin-layers-'));
        const input = join(directory, 'white.png');
        const output = join(directory, 'result');
        await writeFile(input, original, { mode: 0o600 });
        await run(python, [runner, '--blanca', input, '--out', output]);
        const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
        if (manifest.schemaVersion !== 1 || manifest.validated !== false || manifest.score !== null) throw error('layers_invalid');
        const images = [];
        for (const key of allowed) {
          if (!manifest.images?.includes(key + '.jpg')) continue;
          const image = await sharp(join(output, key + '.jpg')).resize({ width: 1224, height: 1632, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
          const stats = manifest.layers?.[key === 'lesiones' ? 'lesiones_inflamadas' : key];
          images.push({ key, dataUrl: 'data:image/jpeg;base64,' + image.toString('base64'), candidateCount: stats?.candidateCount ?? null });
        }
        if (!images.length) throw error('layers_invalid');
        return { method: manifest.method, validated: false, images,
          notice: 'Detecciones experimentales pendientes de revisión. Los conteos son candidatos, no hallazgos confirmados. Sin medición UV ni Wood.' };
      } finally {
        try { if (directory) await rm(directory, { recursive: true, force: true }); }
        finally { busy = false; }
      }
    },
  });
}
