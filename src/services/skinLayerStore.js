import { randomUUID } from 'node:crypto';

const FOLDER = 'venus-expedientes/skin-maps';
const SAFE = /^[A-Za-z0-9_-]{1,128}$/;
const invalid = () => new Error('invalid_layer_target');

// Saved processed maps live beside the record's photos in Cloudinary.
// Only paths built here (inside FOLDER) can be written or destroyed.
export function createSkinLayerStore({ cloudinary }) {
  return Object.freeze({
    save(bytes, { recordId, key }) {
      if (!SAFE.test(recordId || '') || !/^[a-z_]{1,32}$/.test(key || '')) return Promise.reject(invalid());
      return new Promise((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
          { folder: `${FOLDER}/${recordId}`, public_id: `${key}-${randomUUID()}`, resource_type: 'image', format: 'jpg', overwrite: false },
          (error, result) => error ? reject(error) : resolve({ url: result.secure_url, publicId: result.public_id }),
        );
        upload.end(bytes);
      });
    },
    async remove(publicId) {
      if (typeof publicId !== 'string' || !publicId.startsWith(FOLDER + '/') || publicId.includes('..')) throw invalid();
      await cloudinary.uploader.destroy(publicId);
    },
  });
}
