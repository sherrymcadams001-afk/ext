// Multi-provider LLM client with key rotation & graceful fallback.
// Sources provider configs from chrome.storage.local key: 'llm-api-keys'.
// Expected shape: { providers: { providerId: { apiKey, baseUrl, type, modelNames[] } } }
// This client normalizes calls to OpenAI-compatible /chat/completions & /embeddings endpoints.
// Rotation strategy: round-robin starting from last successful provider; skips providers with consecutive failures above threshold.
// Health tracking: failCount (resets on success), lastError timestamp/message.
// Usage: const llm = await MultiLLMClient.createOrSingle({ logger }); await llm.chat({...});

import { LLMClient } from './llmClient.js';

const STORAGE_KEY = 'llm-api-keys';
const DEFAULT_FAIL_THRESHOLD = 3;

export class MultiLLMClient {
  constructor({ providers, logger = console, failThreshold = DEFAULT_FAIL_THRESHOLD }) {
    this.logger = logger;
    this.failThreshold = failThreshold;
    this._index = 0;
    this.health = new Map(); // providerId -> { failCount, lastError, lastSuccess }
    this.clients = providers.map(p => ({ id: p.id, client: new LLMClient({
      storageKey: p.storageKey || p.id, // fallback; we don't use storageKey inside LLMClient when apiKey direct provided.
      baseUrl: p.baseUrl || 'https://api.openai.com/v1',
      fetchImpl: p.fetchImpl || fetch,
      logger
    }), apiKey: p.apiKey, type: p.type, modelNames: p.modelNames || [] }));
  }

  static async loadRawProviders() {
    return new Promise(resolve => {
      chrome.storage.local.get([STORAGE_KEY], res => {
        const raw = res[STORAGE_KEY];
        if (!raw || typeof raw !== 'object') return resolve([]);
        const out = [];
        for (const [id, cfg] of Object.entries(raw.providers || {})) {
          if (!cfg || !cfg.apiKey) continue;
          out.push({ id, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, type: cfg.type, modelNames: cfg.modelNames });
        }
        resolve(out);
      });
    });
  }

  static async createOrSingle({ logger = console } = {}) {
    const providers = await MultiLLMClient.loadRawProviders();
    if (!providers.length) {
      logger.warn('[MultiLLMClient] No configured providers; falling back to single LLMClient (OPENAI_API_KEY)');
      return new LLMClient({ logger });
    }
    if (providers.length === 1) {
      const p = providers[0];
      logger.info('[MultiLLMClient] Single provider detected:', p.id);
      return new LLMClient({ baseUrl: p.baseUrl, logger });
    }
    logger.info('[MultiLLMClient] Loaded providers', providers.map(p => p.id));
    return new MultiLLMClient({ providers, logger });
  }

  _nextIndex() {
    this._index = (this._index + 1) % this.clients.length;
    return this._index;
  }

  _eligibleClients() {
    return this.clients.filter(c => {
      const h = this.health.get(c.id);
      return !h || h.failCount < this.failThreshold;
    });
  }

  _recordSuccess(id) {
    const h = this.health.get(id) || { failCount: 0 };
    h.failCount = 0;
    h.lastSuccess = Date.now();
    this.health.set(id, h);
  }

  _recordFailure(id, err) {
    const h = this.health.get(id) || { failCount: 0 };
    h.failCount += 1;
    h.lastError = { ts: Date.now(), message: err.message };
    this.health.set(id, h);
    this.logger.warn('[MultiLLMClient] provider failure', { id, failCount: h.failCount, error: err.message });
  }

  async chat({ messages, model = 'gpt-4o-mini', temperature = 0.2, maxTokens = 1200, provider }) {
    const attempts = [];
    const pool = provider ? this.clients.filter(c => c.id === provider) : this._eligibleClients();
    if (!pool.length) throw new Error('No eligible LLM providers available');
    let idx = this._index % pool.length;
    for (let i = 0; i < pool.length; i++) {
      const entry = pool[idx];
      try {
        // Direct call using entry.client but override key via header injection.
        const apiKey = entry.apiKey;
        const body = { model, messages: messages.map(m => ({ role: m.role, content: m.content })), temperature, max_tokens: maxTokens, stream: false };
        const res = await fetch(`${entry.client.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`LLM chat failed: ${res.status} ${await res.text()}`);
        const json = await res.json();
        const choice = json.choices?.[0];
        const text = choice?.message?.content || '';
        this._recordSuccess(entry.id);
        this._index = this.clients.findIndex(c => c.id === entry.id); // advance base index to successful provider
        return { text, raw: json, provider: entry.id };
      } catch (err) {
        attempts.push({ id: entry.id, error: err.message });
        this._recordFailure(entry.id, err);
        idx = (idx + 1) % pool.length;
        continue;
      }
    }
    throw new Error('All providers failed: ' + JSON.stringify(attempts));
  }

  async embed(texts, { model = 'text-embedding-3-small', provider } = {}) {
    if (!Array.isArray(texts)) texts = [texts];
    const attempts = [];
    const pool = provider ? this.clients.filter(c => c.id === provider) : this._eligibleClients();
    if (!pool.length) throw new Error('No eligible LLM providers available');
    let idx = this._index % pool.length;
    for (let i = 0; i < pool.length; i++) {
      const entry = pool[idx];
      try {
        const apiKey = entry.apiKey;
        const body = { input: texts, model };
        const res = await fetch(`${entry.client.baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
        const json = await res.json();
        const vectors = json.data.map(d => d.embedding);
        this._recordSuccess(entry.id);
        this._index = this.clients.findIndex(c => c.id === entry.id);
        return { vectors, provider: entry.id, raw: json };
      } catch (err) {
        attempts.push({ id: entry.id, error: err.message });
        this._recordFailure(entry.id, err);
        idx = (idx + 1) % pool.length;
        continue;
      }
    }
    throw new Error('All providers failed (embed): ' + JSON.stringify(attempts));
  }

  listProviders() { return this.clients.map(c => c.id); }
  getHealth() { return Array.from(this.health.entries()).map(([id, h]) => ({ id, ...h })); }
}
