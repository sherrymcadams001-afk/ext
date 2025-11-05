// Lean MV3 background bootstrap (experimental)
// This file is an optional replacement for the heavy bundled background.iife.js.
// It intentionally excludes any DOM / Puppeteer-style utilities that are unusable
// inside a service worker context to reduce parse/activation time.

import { createAgentState } from "./agent/core/state.js";
import { AgentLoop } from "./agent/core/agentLoop.js";
import { createProviderRouter } from "./agent/providers/router.js";
import { createActionRegistry } from "./agent/actions/registry.js";
import { createRunLogger } from "./agent/logging/runLogger.js";

let started = false;
let ctxPromise;

async function bootstrapLeanAgent() {
  if (started) return ctxPromise;
  started = true;
  ctxPromise = (async () => {
    const logger = createRunLogger();
    const state = createAgentState({ logger });
    await state.init();

    const providers = createProviderRouter({ logger });
    const actions = createActionRegistry({ logger });

    const loop = new AgentLoop({ state, providers, actions, logger });
    await loop.start();

    // Runtime message endpoints (minimal surface)
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || typeof msg !== 'object') return false;
      if (msg.type === 'leanAgent.enqueueGoal') {
        state.enqueueGoal(msg.payload).then(g => sendResponse({ ok: true, goal: g })).catch(e => sendResponse({ ok:false, error: e.message }));
        return true;
      }
      if (msg.type === 'leanAgent.state') {
        sendResponse({ ok: true, snapshot: state.getSnapshot() });
        return true;
      }
      if (msg.type === 'leanAgent.providers') {
        providers.getConfig().then(conf => sendResponse({ ok: true, providers: providers.listProviders(), config: conf })).catch(err => sendResponse({ ok:false, error: err.message }));
        return true;
      }
      if (msg.type === 'leanAgent.actions') {
        sendResponse({ ok: true, actions: actions.list() });
        return true;
      }
      if (msg.type === 'leanAgent.health') {
        sendResponse({ ok: true, started: true, ts: Date.now() });
        return true;
      }
      return false;
    });

    logger.info('[lean-background] agent started', {
      providers: providers.listProviders(),
      actions: actions.list(),
    });

    return { logger, state, providers, actions, loop };
  })();
  return ctxPromise;
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  bootstrapLeanAgent().catch(err => console.error('[lean-background] bootstrap failure', err));
}

export { bootstrapLeanAgent };
