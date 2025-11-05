// Core autonomous loop (simplified) executed in background service worker.
import { trimConversation } from './messages.js';

export class AgentLoop {
  constructor({ state, llm, rag, tools, logger = console, intervalMs = 5000, maxTokens = 2000 }) {
    this.state = state;
    this.llm = llm;
    this.rag = rag;
    this.tools = tools;
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.maxTokens = maxTokens;
    this.timer = null;
    this.running = false;
  }

  async start() {
    if (this.running) return; this.running = true;
    this.logger.info('[AgentLoop] start');
    this.tick();
  }

  stop() { if (this.timer) clearTimeout(this.timer); this.running = false; }

  schedule() { if (!this.running) return; this.timer = setTimeout(() => this.tick().catch(e => this.logger.error('tick error', e)), this.intervalMs); }

  async tick() {
    try {
      const goal = this.state.currentGoal || this.state.nextGoal();
      if (!goal) { this.schedule(); return; }
      // Build prompt
      const convo = trimConversation(this.state.messages, this.maxTokens - 400);
      const system = `You are a browser automation agent. Current goal: ${goal.text}. Decide next single tool action or finish.`;
      const messages = [{ role: 'system', content: system }, ...convo.map(m => ({ role: m.role, content: m.content }))];
      messages.push({ role: 'user', content: 'Plan next action.' });
      const resp = await this.llm.chat({ messages, model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 400 });
      const text = resp.text.trim();
      this.state.appendAssistant(text);

      if (/^done/i.test(text)) {
        goal.status = 'done';
        this.logger.info('[AgentLoop] goal complete', { goal: goal.id });
        this.schedule();
        return;
      }

      // naive tool extraction: format TOOL:name args JSON
      const match = text.match(/TOOL:\s*(\w+)\s*(\{.*\})?/i);
      if (match) {
        const name = match[1];
        let args = {};
        if (match[2]) {
          try { args = JSON.parse(match[2]); } catch (e) { this.logger.warn('Failed to parse args JSON', e); }
        }
        this.logger.info('[AgentLoop] executing tool', { name, args });
        try {
          const result = await this.tools.run(name, args);
          this.state.appendSystem(`Tool ${name} result: ${JSON.stringify(result).slice(0,1000)}`);
        } catch (err) {
          this.state.appendSystem(`Tool ${name} error: ${err.message}`);
        }
      } else {
        this.logger.info('[AgentLoop] no tool pattern found');
      }
    } catch (err) {
      this.logger.error('[AgentLoop] tick failure', err);
      this.state.appendSystem(`Error: ${err.message}`);
    } finally {
      this.schedule();
    }
  }
}
