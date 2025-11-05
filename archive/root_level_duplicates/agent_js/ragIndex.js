// Simple in-memory RAG index with cosine similarity.
// Not persistent; can be extended using chrome.storage for persistence.

import { LLMClient } from './llmClient.js';

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

export class RAGIndex {
  constructor({ llmClient, maxDocuments = 500 } = {}) {
    this.llm = llmClient || new LLMClient();
    this.maxDocuments = maxDocuments;
    this.docs = []; // { id, text, embedding }
  }

  async add(text, meta = {}) {
    if (!text || typeof text !== 'string') throw new Error('RAG add requires text');
    const embedding = await this.llm.embedCached(text);
    const doc = { id: crypto.randomUUID(), text, embedding, meta };
    this.docs.push(doc);
    if (this.docs.length > this.maxDocuments) this.docs.shift();
    return doc;
  }

  async replaceDomain(domain, texts) {
    this.docs = this.docs.filter(d => d.meta?.domain !== domain);
    for (const t of texts) {
      await this.add(t, { domain });
    }
  }

  query(queryText, { k = 5 } = {}) {
    if (!this.docs.length) return [];
    // For speed, we embed once then compare
    return this.llm.embedCached(queryText).then(vec => {
      const scored = this.docs.map(d => ({ doc: d, score: cosine(vec, d.embedding) }));
      scored.sort((a,b) => b.score - a.score);
      return scored.slice(0, k);
    });
  }
}
