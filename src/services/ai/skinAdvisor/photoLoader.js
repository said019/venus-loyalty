const MAX_BYTES = 5 * 1024 * 1024;
const error = code => Object.assign(new Error('No se pudo cargar la fotografía autorizada.'), { code });

// Only receives a photo fetched from the authorized record by the workflow.
// Never accepts a request URL as a storage location.
export function createSkinPhotoLoader({ cloudName, fetch: fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid timeout');
  return async (photo, { signal } = {}) => {
    if (signal?.aborted) throw error('photo_timeout');
    let url;
    try { url = new URL(photo?.url); } catch { throw error('photo_storage_unavailable'); }
    if (typeof cloudName !== 'string' || !/^[a-z0-9_-]+$/i.test(cloudName)
      || url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com'
      || url.port || url.username || url.password
      || !url.pathname.startsWith(`/${cloudName}/image/upload/`)) throw error('photo_storage_unavailable');
    const controller = new AbortController();
    let timer;
    let rejectAbort;
    const cancelled = new Promise((_, reject) => { rejectAbort = reject; });
    const onAbort = () => { controller.abort(); rejectAbort(error('photo_timeout')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const request = (async () => {
      const response = await fetchImpl(url.href, { redirect: 'manual', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (!response.ok) throw error('photo_unavailable');
      const mediaType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) throw error('invalid_photo');
      if (Number(response.headers.get('content-length')) > MAX_BYTES) throw error('invalid_photo');
      const reader = response.body?.getReader();
      if (!reader) throw error('photo_unavailable');
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { void reader.cancel().catch(() => {}); throw error('invalid_photo'); }
        chunks.push(Buffer.from(value));
      }
      if (!size) throw error('invalid_photo');
      return { bytes: Buffer.concat(chunks), mediaType };
    })();
    request.catch(() => {});
    try {
      return await Promise.race([request, cancelled, new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(error('photo_timeout')); }, timeoutMs);
      })]);
    } catch (cause) {
      if (['photo_timeout', 'photo_unavailable', 'invalid_photo'].includes(cause?.code)) throw cause;
      throw error('photo_unavailable');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); controller.abort(); }
  };
}
