import { resolveStorageArea, storageGet, storageSet } from "../util/chromeStorage.js";

const STATE_STORAGE_KEY = "agent:state:v1";
const HISTORY_LIMIT = 20;

const createBaseState = () => ({
  version: 1,
  currentGoal: null,
  goalQueue: [],
  history: [],
  meta: {
    consecutiveFailures: 0,
    totalRuns: 0,
    completedGoals: 0,
    lastRunAt: null,
    lastFailure: null,
  },
});

const clone = (value) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
};

const normalizeGoalInput = (payload) => {
  if (!payload) {
    throw new Error("Goal payload is required");
  }

  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) {
      throw new Error("Goal string payload cannot be empty");
    }

    return {
      title: text,
      prompt: text,
      metadata: {},
      channel: "manual",
    };
  }

  if (typeof payload !== "object") {
    throw new Error("Goal payload must be a string or object");
  }

  const title = payload.title ?? payload.prompt ?? payload.text;
  if (!title || !String(title).trim()) {
    throw new Error("Goal payload must include a title, prompt, or text field");
  }

  return {
    title: String(payload.title ?? title).trim(),
    prompt: String(payload.prompt ?? title).trim(),
    metadata: payload.metadata ?? {},
    channel: payload.channel ?? "manual",
    context: payload.context ?? {},
    expectedOutcome: payload.expectedOutcome ?? payload.outcome ?? null,
  };
};

const hydrateState = (raw) => {
  if (!raw || typeof raw !== "object") {
    return createBaseState();
  }

  const base = createBaseState();
  return {
    ...base,
    ...raw,
    meta: {
      ...base.meta,
      ...(raw.meta ?? {}),
    },
    goalQueue: Array.isArray(raw.goalQueue) ? raw.goalQueue : [],
    history: Array.isArray(raw.history) ? raw.history.slice(-HISTORY_LIMIT) : [],
  };
};

const createAgentState = ({ storageArea = "local", logger } = {}) => {
  const area = resolveStorageArea(storageArea);
  let internalState = createBaseState();
  let initialized = false;

  const persist = async () => {
    await storageSet(area, { [STATE_STORAGE_KEY]: internalState });
  };

  const broadcast = (reason) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      return;
    }

    try {
      const snapshot = clone(internalState);
      chrome.runtime.sendMessage({
        type: "agent.stateUpdate",
        payload: {
          reason,
          snapshot,
        },
      });
    } catch (error) {
      logger?.warn?.("Failed to broadcast state update", { error: error.message });
    }
  };

  const init = async () => {
    if (initialized) {
      return clone(internalState);
    }

    const stored = await storageGet(area, STATE_STORAGE_KEY);
    internalState = hydrateState(stored);
    initialized = true;
    return clone(internalState);
  };

  const getSnapshot = () => clone(internalState);

  const enqueueGoal = async (payload) => {
    await init();
    const normalized = normalizeGoalInput(payload);
    const goal = {
      id: crypto.randomUUID(),
      status: "queued",
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runCount: 0,
      dueAt: normalized.dueAt ?? Date.now(),
      ...normalized,
    };

    internalState.goalQueue.push(goal);
    await persist();
    logger?.info?.("Goal enqueued", { goalId: goal.id, title: goal.title });
    broadcast("goal-enqueued");
    return goal;
  };

  const pullNextGoal = async () => {
    await init();
    if (internalState.currentGoal) {
      return internalState.currentGoal;
    }

    if (!internalState.goalQueue.length) {
      return null;
    }

    internalState.goalQueue.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
    const nextGoal = internalState.goalQueue.shift();

    internalState.currentGoal = {
      ...nextGoal,
      status: "running",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      steps: Array.isArray(nextGoal.steps) ? nextGoal.steps : [],
    };

    await persist();
    broadcast("goal-started");
    return internalState.currentGoal;
  };

  const recordPlannerDecision = async ({ goalId, plan, provider }) => {
    await init();
    if (!goalId || !internalState.currentGoal || internalState.currentGoal.id !== goalId) {
      return;
    }

    internalState.currentGoal.lastPlan = {
      id: crypto.randomUUID(),
      provider,
      plan,
      createdAt: Date.now(),
    };

    internalState.currentGoal.updatedAt = Date.now();
    await persist();
    broadcast("planner-decision");
  };

  const recordAction = async ({ goalId, action, result, providerResponse }) => {
    await init();
    if (!goalId || !internalState.currentGoal || internalState.currentGoal.id !== goalId) {
      return;
    }

    const step = {
      id: crypto.randomUUID(),
      action,
      result,
      providerResponse,
      createdAt: Date.now(),
    };

    internalState.currentGoal.steps.push(step);
    internalState.currentGoal.lastAction = step;
    internalState.currentGoal.updatedAt = Date.now();
    internalState.meta.totalRuns += 1;
    internalState.meta.lastRunAt = new Date().toISOString();

    await persist();
    broadcast("action-recorded");
    return step;
  };

  const completeGoal = async ({ status = "success", summary, observation }) => {
    await init();
    if (!internalState.currentGoal) {
      return null;
    }

    const finishedGoal = {
      ...internalState.currentGoal,
      status,
      summary: summary ?? observation ?? internalState.currentGoal.prompt,
      observation: observation ?? internalState.currentGoal.lastAction?.result?.observation ?? null,
      completedAt: Date.now(),
    };

    internalState.history = [...internalState.history, finishedGoal].slice(-HISTORY_LIMIT);
    internalState.meta.consecutiveFailures = status === "success" ? 0 : internalState.meta.consecutiveFailures + 1;
    if (status === "success") {
      internalState.meta.completedGoals += 1;
    }
    internalState.currentGoal = null;

    await persist();
    broadcast("goal-completed");
    return finishedGoal;
  };

  const requeueCurrentGoal = async ({ delayMs = 0, reason }) => {
    await init();
    if (!internalState.currentGoal) {
      return;
    }

    const goal = {
      ...internalState.currentGoal,
      status: "queued",
      updatedAt: Date.now(),
      dueAt: Date.now() + delayMs,
      carryOverReason: reason,
    };

    delete goal.startedAt;
    delete goal.completedAt;

    internalState.goalQueue.push(goal);
    internalState.currentGoal = null;

    await persist();
    broadcast("goal-requeued");
  };

  const recordFailure = async ({ goalId, error, requeue = false }) => {
    await init();
    internalState.meta.consecutiveFailures += 1;
    internalState.meta.lastFailure = {
      at: new Date().toISOString(),
      goalId,
      message: error?.message ?? String(error),
    };

    if (requeue && internalState.currentGoal && internalState.currentGoal.id === goalId) {
      await requeueCurrentGoal({ delayMs: 5 * 60 * 1000, reason: "automatic-retry" });
    } else if (internalState.currentGoal && internalState.currentGoal.id === goalId) {
      internalState.history = [
        ...internalState.history,
        {
          ...internalState.currentGoal,
          status: "failed",
          error: error?.message ?? String(error),
          completedAt: Date.now(),
        },
      ].slice(-HISTORY_LIMIT);
      internalState.currentGoal = null;
    }

    await persist();
    broadcast("failure-recorded");
  };

  const reset = async () => {
    internalState = createBaseState();
    await persist();
    broadcast("state-reset");
  };

  return {
    init,
    getSnapshot,
    enqueueGoal,
    pullNextGoal,
    recordPlannerDecision,
    recordAction,
    completeGoal,
    requeueCurrentGoal,
    recordFailure,
    reset,
  };
};

export { createAgentState };
