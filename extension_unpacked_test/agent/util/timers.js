const MIN_SLEEP_MS = 10;

const sleep = (ms) => new Promise((resolve) => {
  const delay = Number.isFinite(ms) && ms > MIN_SLEEP_MS ? ms : MIN_SLEEP_MS;
  setTimeout(resolve, delay);
});

const jitter = (baseMs, spread = 0.25) => {
  if (!Number.isFinite(baseMs)) {
    return MIN_SLEEP_MS;
  }

  const span = baseMs * spread;
  return Math.max(MIN_SLEEP_MS, Math.floor(baseMs + (Math.random() * span * 2 - span)));
};

const withTimeout = async (promise, timeoutMs, onTimeout) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(onTimeout ?? "Operation timed out"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

export {
  jitter,
  sleep,
  withTimeout,
};
