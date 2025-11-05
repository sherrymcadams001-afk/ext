// Action registry & dispatch
// Each action: { name, handler(payload, context): Promise<any>, description }

const _actions = new Map();

export function registerAction(name, handler, description = '') {
  if (!name || typeof handler !== 'function') throw new Error('Invalid action registration');
  if (_actions.has(name)) console.warn('[agent/actions] Overwriting action', name);
  _actions.set(name, { name, handler, description });
}

export async function dispatchAction(name, payload, context) {
  const entry = _actions.get(name);
  if (!entry) throw new Error(`Unknown action: ${name}`);
  return await entry.handler(payload, context);
}

export function listActions() {
  return [..._actions.keys()];
}

// Built-in actions
registerAction('ping', (payload) => ({ pong: true, at: Date.now(), echo: payload || null }), 'Health check');

registerAction('getState', (_, ctx) => ctx.state.getSnapshot(), 'Return current agent state');

registerAction('enqueueGoal', (payload, ctx) => {
  if (!payload || !payload.goal) throw new Error('enqueueGoal requires { goal }');
  ctx.enqueueGoal(payload.goal);
  return { ok: true };
}, 'Queue a new high-level goal');
