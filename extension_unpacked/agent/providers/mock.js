const extractLatestUserMessage = (messages) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return messages[i];
    }
  }

  return null;
};

const createMockAdapter = ({ logger }) => {
  const estimateTokens = ({ messages }) => {
    const totalChars = messages.reduce((acc, message) => acc + (message?.content?.length ?? 0), 0);
    return Math.ceil(totalChars / 4);
  };

  const invoke = async ({ role, messages }) => {
    const latestUser = extractLatestUserMessage(messages ?? []);
    const goalText = latestUser?.content ?? "No goal provided.";

    if (role === "planner") {
      const plan = {
        text: `Mock planner selecting default noop action for goal: "${goalText}"`,
        action: {
          name: "noop",
          params: { reason: "mock-provider" },
          confidence: 0.25,
        },
      };

      logger?.info?.("Mock planner invoked", { goal: goalText });
      return plan;
    }

    const message = {
      text: `Mock navigator acknowledges completion for goal: "${goalText}"`,
      action: null,
    };

    logger?.info?.("Mock navigator invoked", { goal: goalText });
    return message;
  };

  return {
    name: "mock",
    invoke,
    estimateTokens,
  };
};

export { createMockAdapter };
