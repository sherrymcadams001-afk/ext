// Message schema definitions for in-extension agent (MV3 JS port)
// Provides runtime type guards and serialization helpers.

export const MessageRole = Object.freeze({
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool'
});

export function createMessage({ role, content, toolCalls, toolResult }) {
  if (!MessageRole[role.toUpperCase()]) throw new Error(`Invalid role: ${role}`);
  const msg = { id: crypto.randomUUID(), role, content: content ?? '', toolCalls: [], toolResult: toolResult ?? null, ts: Date.now() };
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      msg.toolCalls.push(validateToolCall(tc));
    }
  }
  return msg;
}

export function validateToolCall(tc) {
  if (!tc || typeof tc !== 'object') throw new Error('Tool call must be object');
  if (!tc.name || typeof tc.name !== 'string') throw new Error('Tool call missing name');
  return {
    id: tc.id || crypto.randomUUID(),
    name: tc.name,
    args: tc.args ?? {},
  };
}

export function serializeConversation(messages) {
  return messages.map(m => ({ role: m.role, content: m.content }));
}

export function trimConversation(messages, tokenBudget) {
  // Simple heuristic: approximate tokens by 4 chars per token.
  let est = 0;
  const out = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const add = Math.ceil((m.content?.length || 0) / 4);
    if (est + add > tokenBudget && out.length) break;
    est += add;
    out.unshift(m);
  }
  return out;
}
