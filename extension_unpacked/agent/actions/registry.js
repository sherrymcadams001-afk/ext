import { Tabs } from "../util/chromeAsync.js";

const createActionRegistry = ({ logger }) => {
  const actions = new Map();

  const register = (name, handler, options = {}) => {
    actions.set(name, {
      name,
      handler,
      options,
    });
  };

  const has = (name) => actions.has(name);

  const list = () => [...actions.keys()];

  const run = async (name, context) => {
    const action = actions.get(name);
    if (!action) {
      throw new Error(`Unknown agent action: ${name}`);
    }

    const startedAt = Date.now();
    try {
      const result = await action.handler(context);
      const completedAt = Date.now();

      logger?.info?.("Action executed", {
        name,
        durationMs: completedAt - startedAt,
        goalId: context.goal?.id,
        observation: result?.observation,
        status: result?.status ?? "success",
      });

      return {
        status: result?.status ?? "success",
        observation: result?.observation ?? null,
        data: result?.data ?? null,
        terminal: result?.terminal ?? false,
        completedAt,
      };
    } catch (error) {
      logger?.error?.("Action execution failed", {
        name,
        goalId: context.goal?.id,
        error: error.message,
      });
      throw error;
    }
  };

  register("noop", async () => ({
    status: "success",
    observation: "No operation executed (noop)",
    terminal: true,
  }));

  register("open-tab", async ({ input }) => {
    if (!input || typeof input.url !== "string") {
      throw new Error("open-tab action requires an input.url string");
    }

    const tab = await Tabs.create({ url: input.url, active: true });
    return {
      status: "success",
      observation: `Opened new tab to ${tab?.url ?? input.url}`,
      data: { tabId: tab?.id, url: tab?.url ?? input.url },
      terminal: true,
    };
  });

  register("note", async ({ input }) => ({
    status: "success",
    observation: input?.text ?? "",
    terminal: true,
  }));

  return {
    register,
    has,
    list,
    run,
  };
};

export { createActionRegistry };
