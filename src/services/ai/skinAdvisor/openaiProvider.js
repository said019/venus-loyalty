import { OUTPUT_SCHEMA, validateAssessment } from './contract.js';
import { assertPreparedContext } from './context.js';
import { buildUserContent, DEVELOPER_PROMPT } from './prompt.js';

const ENDPOINT = 'https://api.openai.com/v1/responses';
const MAX_RESPONSE_BYTES = 1_000_000;

class ProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SkinAdvisorProviderError';
    this.code = code;
  }
}

const providerError = (code) => new ProviderError(code, {
  disabled: 'OpenAI skin analysis is disabled.',
  key_missing: 'OpenAI skin analysis is not configured.',
  timeout: 'The analysis request timed out.',
  aborted: 'The analysis request was cancelled.',
  provider_http: 'The analysis provider returned an error.',
  network: 'The analysis provider could not be reached.',
  response_too_large: 'The analysis provider response was too large.',
  malformed_response: 'The analysis provider response was malformed.',
  refused: 'The analysis provider refused the request.',
  incomplete: 'The analysis provider did not complete the request.',
  missing_output: 'The analysis provider returned no assessment.',
  ambiguous_output: 'The analysis provider returned ambiguous output.',
}[code] ?? 'The analysis request failed.');

const readResponse = async (response) => {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) return result + decoder.decode();
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw providerError('response_too_large');
      }
      result += decoder.decode(value, { stream: true });
    }
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw providerError('response_too_large');
  return text;
};

const parseOutput = (payload, context) => {
  const contents = Array.isArray(payload?.output)
    ? payload.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    : [];
  if (contents.some((item) => item?.type === 'refusal')) throw providerError('refused');
  if (payload?.status !== 'completed') throw providerError('incomplete');
  const texts = contents.filter((item) => item?.type === 'output_text' && typeof item.text === 'string');
  if (texts.length === 0) throw providerError('missing_output');
  if (texts.length !== 1) throw providerError('ambiguous_output');
  let result;
  try {
    result = JSON.parse(texts[0].text);
  } catch {
    throw providerError('malformed_response');
  }
  validateAssessment(result, context);
  return result;
};

export function createOpenAIProvider(config = {}) {
  const enabled = config.enabled === true;
  const apiKey = config.apiKey;
  const model = typeof config.model === 'string' && config.model.trim() ? config.model.trim() : 'gpt-6-astra';
  const timeoutMs = config.timeoutMs ?? 45_000;
  const maxOutputTokens = config.maxOutputTokens ?? 4_000;
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new TypeError('timeoutMs must be between 1 and 60000.');
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 8_000) throw new TypeError('maxOutputTokens is out of range.');
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');

  const metadata = Object.freeze({ provider: 'openai', model, simulation: false });

  const generate = (context, { signal } = {}) => {
    if (!enabled) return Promise.reject(providerError('disabled'));
    if (typeof apiKey !== 'string' || apiKey.trim() === '') return Promise.reject(providerError('key_missing'));
    try {
      assertPreparedContext(context);
      if (context.consent.provider !== 'openai') throw providerError('consent_required');
    } catch (error) {
      return Promise.reject(error);
    }
    if (signal?.aborted) return Promise.reject(providerError('aborted'));

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const request = (async () => {
      let response;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          redirect: 'manual',
          signal: controller.signal,
          body: JSON.stringify({
            model,
            store: false,
            max_output_tokens: maxOutputTokens,
            input: [
              { role: 'developer', content: [{ type: 'input_text', text: DEVELOPER_PROMPT }] },
              { role: 'user', content: buildUserContent(context) },
            ],
            text: { format: { type: 'json_schema', name: 'venus_skin_assessment', strict: true, schema: OUTPUT_SCHEMA } },
          }),
        });
      } catch {
        if (controller.signal.aborted) throw providerError(signal?.aborted ? 'aborted' : 'timeout');
        throw providerError('network');
      }
      if (!response?.ok) throw providerError('provider_http');
      let payload;
      try {
        payload = JSON.parse(await readResponse(response));
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw providerError('malformed_response');
      }
      return parseOutput(payload, context);
    })();
    request.catch(() => {});

    let timer;
    let abortListener;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(providerError('timeout'));
      }, timeoutMs);
    });
    const aborted = new Promise((_, reject) => {
      abortListener = () => reject(providerError('aborted'));
      signal?.addEventListener('abort', abortListener, { once: true });
    });
    return Promise.race([request, timeout, aborted]).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      signal?.removeEventListener('abort', abortListener);
    });
  };

  return Object.freeze({ metadata, generate });
}
