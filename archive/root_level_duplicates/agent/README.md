# Agent Runtime Overview

This directory hosts the in-extension agent runtime that replaces the former LangChain-bound workflow.

## Modules

- `core/state.js` – persistent goal queue, execution history, and failure accounting backed by `chrome.storage`.
- `core/agentLoop.js` – main execution loop that coordinates planner calls, action dispatch, and retries.
- `providers/router.js` – role aware provider router with built-in mock and OpenAI adapters.
- `actions/registry.js` – pluggable action registry containing default `noop`, `open-tab`, and `note` actions.
- `logging/runLogger.js` – lightweight logger with storage-backed ring buffer for recent events.
- `util/` – shared helpers for Chrome storage, async wrappers, and timer utilities.

## Boot Process

`agent/index.js` initializes the logger, state store, provider router, and action registry, then starts the agent loop. The background service worker bootstraps this module through a dynamic `import()` call.

## Adding Providers

Register additional providers via `createProviderRouter.registerAdapter(name, factory)`. Adapter factories must expose an object with:

```js
{
  name: string,
  invoke({ role, messages, config, options }),
  estimateTokens({ messages })
}
```

## Messaging API

Runtime listeners respond to `chrome.runtime.sendMessage` calls with:

- `type: "agent.queueGoal"` – enqueue a new goal; payload mirrors `normalizeGoalInput` requirements.
- `type: "agent.getState"` – returns the current snapshot with queue, history, and metadata.

The background runtime also broadcasts `type: "agent.stateUpdate"` messages whenever the persisted state changes. Each message includes `{ reason, snapshot }`, allowing UI surfaces to react without polling.

These endpoints enable the side panel and developer tools integration without exposing LangChain internals.
