import { createAgentState } from "./core/state.js";
import { AgentLoop } from "./core/agentLoop.js";
import { createProviderRouter } from "./providers/router.js";
import { createActionRegistry } from "./actions/registry.js";
import { createRunLogger } from "./logging/runLogger.js";

let bootstrapPromise;
let listenersRegistered = false;

const registerRuntimeListeners = ({ state, logger }) => {
  if (listenersRegistered) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return false;
    }

    if (message.type === "agent.queueGoal") {
      state
        .enqueueGoal(message.payload)
        .then((goal) => {
          sendResponse({ ok: true, goal });
        })
        .catch((error) => {
          logger.error("Failed to enqueue goal", { error: error.message });
          sendResponse({ ok: false, error: error.message });
        });
      return true;
    }

    if (message.type === "agent.getState") {
      Promise.resolve(state.getSnapshot())
        .then((snapshot) => sendResponse({ ok: true, snapshot }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    return false;
  });

  listenersRegistered = true;
};

const bootstrapAgent = async () => {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    const logger = createRunLogger();
    const state = createAgentState({ logger });
    await state.init();

    const providers = createProviderRouter({ logger });
    const actions = createActionRegistry({ logger });

    const loop = new AgentLoop({ state, providers, actions, logger });
    await loop.start();

    registerRuntimeListeners({ state, logger });

    logger.info("Agent bootstrapped", {
      providers: providers.listProviders(),
      actions: actions.list(),
    });

    return {
      logger,
      state,
      providers,
      actions,
      loop,
    };
  })();

  return bootstrapPromise;
};

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  bootstrapAgent().catch((error) => {
    console.error("Failed to bootstrap agent", error);
  });
}

export { bootstrapAgent };
