// Lightweight agent state & goal queue for MV3.
import { createMessage } from './messages.js';

export class AgentState {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.goals = [];
    this.messages = [];
    this.currentGoal = null;
  }

  enqueueGoal(goal) {
    if (!goal || typeof goal !== 'string') throw new Error('Goal must be string');
    const g = { id: crypto.randomUUID(), text: goal, created: Date.now(), status: 'queued' };
    this.goals.push(g);
    return Promise.resolve(g);
  }

  nextGoal() {
    const g = this.goals.find(x => x.status === 'queued');
    if (g) { g.status = 'active'; this.currentGoal = g; }
    return g;
  }

  appendAssistant(text) { const m = createMessage({ role: 'assistant', content: text }); this.messages.push(m); return m; }
  appendUser(text) { const m = createMessage({ role: 'user', content: text }); this.messages.push(m); return m; }
  appendSystem(text) { const m = createMessage({ role: 'system', content: text }); this.messages.push(m); return m; }

  getSnapshot() {
    return {
      goals: this.goals,
      currentGoal: this.currentGoal,
      messages: this.messages.slice(-50)
    };
  }
}

export function createAgentState(opts) { return new AgentState(opts || {}); }
