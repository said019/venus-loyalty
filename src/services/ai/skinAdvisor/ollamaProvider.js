import { assertPreparedContext } from './context.js';
import { OUTPUT_SCHEMA, validateAssessment } from './contract.js';
import { buildUserContent, DEVELOPER_PROMPT } from './prompt.js';

export function createOllamaProvider(config = {}) {
  const model = config.model || 'qwen3.5:397b';
  const fetchImpl = config.fetch || globalThis.fetch;
  const error = code => Object.assign(new Error('Ollama analysis failed.'), { code });
  return Object.freeze({
    metadata: Object.freeze({ provider: 'ollama', model, simulation: false }),
    async generate(context, { signal } = {}) {
      if (!config.enabled) throw error('disabled');
      if (!config.apiKey?.trim()) throw error('key_missing');
      assertPreparedContext(context);
      if (context.consent.provider !== 'ollama') throw error('consent_required');
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal?.aborted) throw error('aborted');
      signal?.addEventListener('abort', abort, { once: true });
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(error('timeout')); }, config.timeoutMs || 60000);
      });
      try {
        return await Promise.race([timeout, (async () => {
          const response = await fetchImpl('https://ollama.com/api/chat', {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, stream: false, think: false,
              messages: [{ role: 'system', content: DEVELOPER_PROMPT + '\nJSON schema: ' + JSON.stringify(OUTPUT_SCHEMA) },
                { role: 'user', content: buildUserContent(context)[0].text,
                  images: context.photos.map(photo => photo.dataBase64) }],
            }),
          });
          if (!response.ok) throw error('provider_http');
          const reader = response.body.getReader();
          let size = 0; const chunks = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 1000000) { await reader.cancel(); throw error('response_too_large'); }
            chunks.push(Buffer.from(value));
          }
          let result;
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (payload.done !== true || payload.done_reason === 'length') throw error('incomplete');
            const content = payload.message.content.trim();
            const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(content);
            result = JSON.parse(fenced ? fenced[1] : content);
          } catch { throw error('malformed_response'); }
          validateAssessment(result, context);
          return result;
        })()]);
      } catch (failure) {
        if (signal?.aborted) throw error('aborted');
        throw error(failure.code || 'network');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    },
  });
}
