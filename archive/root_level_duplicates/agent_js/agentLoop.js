// Core autonomous loop (simplified) executed in background service worker.
import { trimConversation, createMessage, MessageRole } from './messages.js';

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
    // Local conversational buffer (canonical state implementation does not expose messages array)
    this.conversation = [];
    this.maxMessages = 400; // safeguard
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
      const goal = await this._ensureActiveGoal();
      if (!goal) { this.schedule(); return; }
      const goalText = goal.prompt || goal.title || goal.text || goal.description || '[unnamed goal]';

      // Prepare conversation context
      const convo = trimConversation(this.conversation, this.maxTokens - 400);
      const systemMsg = `You are a browser automation agent. Current goal: ${goalText}. Decide next single tool action or finish.`;
      const messages = [
        { role: 'system', content: systemMsg },
        ...convo.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: 'Plan next action.' }
      ];

      const resp = await this.llm.chat({ messages, model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 400 });
      const text = (resp.text || '').trim();
      this._appendAssistant(text);

      if (!text) {
        this.logger.warn('[AgentLoop] empty model response');
        this.schedule();
        return;
      }

      if (/^done/i.test(text)) {
        await this._completeGoal(goal, text);
        this.logger.info('[AgentLoop] goal complete', { goalId: goal.id });
        this.schedule();
        return;
      }

      // naive tool extraction: format TOOL:name {jsonArgs}
      const match = text.match(/TOOL:\s*(\w+)\s*(\{.*\})?/i);
      if (match) {
        const name = match[1];
        let args = {};
        if (match[2]) {
          try { args = JSON.parse(match[2]); } catch (e) { this.logger.warn('[AgentLoop] Failed to parse args JSON', e); }
        }
        this.logger.info('[AgentLoop] executing tool', { name, args });
        try {
          const result = await this.tools.run(name, args);
          this._appendSystem(`Tool ${name} result: ${JSON.stringify(result).slice(0,1000)}`);
        } catch (err) {
          this._appendSystem(`Tool ${name} error: ${err.message}`);
        }
      } else {
        this.logger.info('[AgentLoop] no tool pattern found');
      }
    } catch (err) {
      this.logger.error('[AgentLoop] tick failure', err);
      this._appendSystem(`Error: ${err.message}`);
    } finally {
      this.schedule();
    }
  }

  async _ensureActiveGoal() {
    // Attempt to get snapshot and pull a goal if none active
    let snapshot = this.state.getSnapshot?.();
    if (!snapshot) return null;
    if (!snapshot.currentGoal) {
      try { await this.state.pullNextGoal?.(); snapshot = this.state.getSnapshot?.() || snapshot; } catch (e) { this.logger.warn('[AgentLoop] pullNextGoal failed', e); }
    }
    return snapshot.currentGoal || null;
  }

  async _completeGoal(goal, summary) {
    if (this.state.completeGoal) {
      try { await this.state.completeGoal({ status: 'success', summary }); return; } catch (e) { this.logger.warn('[AgentLoop] completeGoal failed', e); }
    }
    // Fallback mutate (non-persistent) if completeGoal not available
    goal.status = 'success';
  }

  _append(role, content) {
    try {
      const msg = createMessage({ role, content });
      this.conversation.push(msg);
      if (this.conversation.length > this.maxMessages) this.conversation.splice(0, this.conversation.length - this.maxMessages);
    } catch (e) {
      this.logger.warn('[AgentLoop] failed to append message', e);
    }
  }
  _appendAssistant(content) { this._append(MessageRole.ASSISTANT, content); }
  _appendSystem(content) { this._append(MessageRole.SYSTEM, content); }
}
