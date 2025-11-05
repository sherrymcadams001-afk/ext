// Agent state management
// Provides a lightweight reactive snapshot and chrome.storage persistence.

const STORAGE_KEY = 'agent_state_v1';
const DEFAULT_STATE = {
  version: 1,
  startedAt: Date.now(),
  goals: [], // queued high-level goals
  tasks: [], // expanded actionable tasks
  lastTick: 0,
  status: 'initializing', // initializing | idle | running | error
  stats: { ticks: 0, actions: 0, failures: 0 },
};

let _state = null;
let _loaded = false;
const _subscribers = new Set();

function notify() {
  for (const fn of _subscribers) {
    try { fn(getSnapshot()); } catch (e) { console.warn('[agent/state] subscriber error', e); }
  }
}

function getSnapshot() {
  return JSON.parse(JSON.stringify(_state));
}

async function load() {
  if (_loaded) return _state;
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY]);
    _state = { ...DEFAULT_STATE, ...(data[STORAGE_KEY] || {}) };
  } catch (e) {
    console.warn('[agent/state] load failed, using defaults', e);
    _state = { ...DEFAULT_STATE };
  }
  _loaded = true;
  return _state;
}

async function persist() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: _state });
  } catch (e) {
    console.warn('[agent/state] persist failed', e);
  }
}

function update(mutator) {
  if (!_state) throw new Error('State not loaded');
  mutator(_state);
  notify();
  persist();
}

export async function initState() {
  await load();
  update(s => { s.status = 'idle'; });
  return { getSnapshot, subscribe, update };
}

export function subscribe(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

export function enqueueGoal(goal) {
  update(s => { s.goals.push({ id: crypto.randomUUID(), goal, createdAt: Date.now(), status: 'queued' }); });
}

export function recordAction(result) {
  update(s => {
    s.stats.ticks += result.tickIncrement || 0;
    s.stats.actions += result.actionIncrement || 0;
    if (result.failed) s.stats.failures += 1;
  });
}

export function nextPendingGoal() {
  if (!_state) return null;
  return _state.goals.find(g => g.status === 'queued') || null;
}

export function markGoalRunning(goalId) {
  update(s => { const g = s.goals.find(g => g.id === goalId); if (g) g.status = 'running'; });
}

export function markGoalComplete(goalId) {
  update(s => { const g = s.goals.find(g => g.id === goalId); if (g) g.status = 'done'; });
}

export function setStatus(status) {
  update(s => { s.status = status; });
}
