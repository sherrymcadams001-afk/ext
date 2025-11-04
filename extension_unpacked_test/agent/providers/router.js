import { resolveStorageArea, storageGet, storageSet } from "../util/chromeStorage.js";
import { createMockAdapter } from "./mock.js";
import { createOpenAIAdapter } from "./openai.js";

const PROVIDER_CONFIG_KEY = "agent:providers:config:v1";

const DEFAULT_ROLE_BINDINGS = {
  planner: {
    provider: "mock",
    model: "mock-planner",
    params: {
      temperature: 0.2,
    },
  },
  navigator: {
    provider: "mock",
    model: "mock-navigator",
    params: {
      temperature: 0.4,
    },
  },
};

const normalizeMessages = (messages) =>
  (messages ?? []).map((message) => ({
    role: message.role,
    content: String(message.content ?? ""),
  }));

const parseInlineAction = (text) => {
  if (!text || typeof text !== "string") {
    return null;
  }

  const jsonMatch = text.match(/action\s*[:=]\s*({[\s\S]+?})/i);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed && parsed.name) {
        return {
          name: parsed.name,
          params: parsed.params ?? {},
        };
      }
    } catch (error) {
      // Ignore inline JSON parse errors.
    }
  }

  const directiveMatch = text.match(/action\s+([a-z0-9-_]+)/i);
  if (directiveMatch) {
    return {
      name: directiveMatch[1],
      params: {},
    };
  }

  return null;
};

const buildDefaultResponse = (result) => ({
  text: typeof result === "string" ? result : result?.text ?? "",
  action: result?.action ?? null,
  raw: result,
});

const createProviderRouter = ({ storageArea = "local", logger } = {}) => {
  const area = resolveStorageArea(storageArea);
  const adapters = new Map();

  adapters.set("mock", createMockAdapter({ logger }));
  adapters.set("openai", createOpenAIAdapter({ storageArea: area, logger }));

  const loadConfig = async () => {
    const stored = await storageGet(area, PROVIDER_CONFIG_KEY);
    if (!stored || typeof stored !== "object") {
      return { roles: { ...DEFAULT_ROLE_BINDINGS } };
    }

    return {
      roles: {
        ...DEFAULT_ROLE_BINDINGS,
        ...(stored.roles ?? {}),
      },
    };
  };

  const saveConfig = async (config) => {
    await storageSet(area, { [PROVIDER_CONFIG_KEY]: config });
  };

  const registerAdapter = (name, adapterFactory) => {
    const adapter = adapterFactory({ storageArea: area, logger });
    adapters.set(name, adapter);
  };

  const invoke = async (role, messages, options = {}) => {
    const config = await loadConfig();
    const roleConfig = config.roles[role] ?? DEFAULT_ROLE_BINDINGS[role];
    const adapter = adapters.get(roleConfig?.provider) ?? adapters.get("mock");

    const normalizedMessages = normalizeMessages(messages);
    let response;
    try {
      response = await adapter.invoke({
        role,
        messages: normalizedMessages,
        config: roleConfig,
        options,
      });
    } catch (error) {
      // Graceful fallback: if primary provider fails (e.g., missing API key or network),
      // fall back to mock provider to keep agent loop progressing instead of stalling.
      logger?.warn?.("Provider invocation failed, falling back to mock", {
        role,
        provider: adapter.name,
        error: error.message,
      });
      const mockAdapter = adapters.get("mock");
      response = await mockAdapter.invoke({
        role,
        messages: normalizedMessages,
        config: DEFAULT_ROLE_BINDINGS[role],
        options,
      });
      response.fallback = true;
      response.failedProvider = adapter.name;
    }

  const normalized = buildDefaultResponse(response);
    if (!normalized.action) {
      normalized.action = parseInlineAction(normalized.text);
    }

    const tokenEstimate = adapter.estimateTokens?.({ messages: normalizedMessages }) ?? null;

    logger?.audit?.("provider.invoke", {
      role,
      provider: adapter.name,
      model: roleConfig?.model,
      action: normalized.action?.name,
      tokenEstimate,
    });

    return {
      role,
      provider: adapter.name,
      model: roleConfig?.model,
      text: normalized.text,
      action: normalized.action,
      raw: normalized.raw,
      tokenEstimate,
    };
  };

  return {
    invoke,
    registerAdapter,
    listProviders: () => [...adapters.keys()],
    getConfig: loadConfig,
    setConfig: saveConfig,
  };
};

export { createProviderRouter };
