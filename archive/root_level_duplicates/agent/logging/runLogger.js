import { resolveStorageArea, storageGet, storageSet } from "../util/chromeStorage.js";

const LOG_STORAGE_KEY = "agent:logs:v1";
const MAX_LOG_ENTRIES = 200;

const mapLevelToConsole = (level) => {
  if (level === "error") return "error";
  if (level === "warn") return "warn";
  return "info";
};

const createRunLogger = ({
  storageArea = "local",
  consolePrefix = "[agent]",
  maxEntries = MAX_LOG_ENTRIES,
} = {}) => {
  const area = resolveStorageArea(storageArea);
  let latestSnapshot = [];

  const append = async (entry) => {
    try {
      const existing = (await storageGet(area, LOG_STORAGE_KEY)) ?? [];
      const nextEntries = [...existing, entry].slice(-maxEntries);
      latestSnapshot = nextEntries;
      await storageSet(area, { [LOG_STORAGE_KEY]: nextEntries });
    } catch (error) {
      console.warn(`${consolePrefix} failed to persist log entry`, error);
    }
  };

  const log = (level) => async (message, details) => {
    const entry = {
      id: crypto.randomUUID(),
      level,
      message,
      details,
      timestamp: new Date().toISOString(),
    };

    const consoleMethod = mapLevelToConsole(level);
    console[consoleMethod](`${consolePrefix} ${message}`, details ?? "");

    await append(entry);
    return entry;
  };

  const info = log("info");
  const warn = log("warn");
  const error = log("error");

  const audit = async (event, payload) => info(`event:${event}`, payload);

  const snapshot = () => latestSnapshot;

  const flush = async () => {
    latestSnapshot = [];
    await storageSet(area, { [LOG_STORAGE_KEY]: [] });
  };

  return {
    info,
    warn,
    error,
    audit,
    snapshot,
    flush,
  };
};

export { createRunLogger };
