// Lightweight LLM + Embeddings client for MV3 service worker.
// Supports OpenAI-style endpoints; extendable via provider adapters.

const DEFAULT_BASE = 'https://api.openai.com/v1';

export class LLMClient {
  constructor({ storageKey = 'OPENAI_API_KEY', provider = 'openai', baseUrl = DEFAULT_BASE, fetchImpl = fetch, logger = console } = {}) {
    this.storageKey = storageKey;
    this.provider = provider;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.logger = logger;
    this.cache = new Map(); // embedding cache by text hash
  }

  async getApiKey() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([this.storageKey], (res) => {
        const k = res[this.storageKey];
        if (!k) return reject(new Error(`Missing API key in storage under ${this.storageKey}`));
        resolve(k);
      });
    });
  }

  async chat({ model = 'gpt-4o-mini', messages, temperature = 0.2, maxTokens = 1200 }) {
    const apiKey = await this.getApiKey();
    const body = { model, messages: messages.map(m => ({ role: m.role, content: m.content })), temperature, max_tokens: maxTokens, stream: false };
    const res = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`LLM chat failed: ${res.status} ${txt}`);
    }
    const json = await res.json();
    const choice = json.choices?.[0];
    return { text: choice?.message?.content || '', raw: json };
  }

  async embed(texts, { model = 'text-embedding-3-small' } = {}) {
    if (!Array.isArray(texts)) texts = [texts];
    const apiKey = await this.getApiKey();
    const body = { input: texts, model };
    const res = await this.fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Embedding failed: ${res.status} ${txt}`);
    }
    const json = await res.json();
    return json.data.map(d => d.embedding);
  }

  async embedCached(text, options) {
    const key = this._hash(text + '|' + (options?.model || 'text-embedding-3-small'));
    if (this.cache.has(key)) return this.cache.get(key);
    const [vec] = await this.embed([text], options);
    this.cache.set(key, vec);
    return vec;
  }

  _hash(str) {
    let h = 0; for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i); return (h >>> 0).toString(16);
  }
}
