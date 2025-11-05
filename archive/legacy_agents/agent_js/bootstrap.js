// Bootstrap JS-only agent inside MV3 background (no Python dependency)
import { createAgentState } from './state.js';
import { AgentLoop } from './agentLoop.js';
import { LLMClient } from './llmClient.js';
import { RAGIndex } from './ragIndex.js';
import { ToolRegistry } from './tools.js';

let started = false;
let ctx;

async function startAgent() {
  if (started) return ctx;
  started = true;
  const logger = console;
  const state = createAgentState({ logger });
  const llm = new LLMClient({ logger });
  const rag = new RAGIndex({ llmClient: llm });
  const tools = new ToolRegistry({ logger });
  const loop = new AgentLoop({ state, llm, rag, tools, logger });
  await loop.start();

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type === 'jsAgent.enqueueGoal') {
      state.enqueueGoal(msg.payload).then(g => sendResponse({ ok: true, goal: g })).catch(e => sendResponse({ ok:false, error: e.message }));
      return true;
    }
    if (msg.type === 'jsAgent.snapshot') {
      sendResponse({ ok: true, snapshot: state.getSnapshot() });
      return true;
    }
    if (msg.type === 'jsAgent.listTools') {
      sendResponse({ ok: true, tools: tools.list() });
      return true;
    }
    return false;
  });

  ctx = { logger, state, llm, rag, tools, loop };
  logger.info('[bootstrap] JS agent initialized');
  return ctx;
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  startAgent().catch(err => console.error('bootstrap failure', err));
}

export { startAgent };
