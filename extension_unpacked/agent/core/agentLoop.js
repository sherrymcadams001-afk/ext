import { sleep, jitter } from "../util/timers.js";

const DEFAULT_CONFIG = {
  idleIntervalMs: 15_000,
  iterationIntervalMs: 5_000,
  failureBackoffMs: 30_000,
  alarmName: "agent.loop.tick",
  maxConsecutiveFailures: 5,
};

const buildPlannerSystemPrompt = (goal) => `You are a planning agent operating inside a Chrome extension. You must respond with a JSON object of the form:\n{\n  "action": {\n    "name": string,\n    "params": object\n  },\n  "reasoning": string\n}\n\nChoose from the available actions: noop, open-tab, note. Always include the action name and params. Current goal: "${goal.title ?? goal.prompt}".`;

class AgentLoop {
  constructor({ state, providers, actions, logger, config = {} }) {
    this.state = state;
    this.providers = providers;
    this.actions = actions;
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.running = false;
    this.alarmListener = this.handleAlarm.bind(this);
  }

  async start() {
    if (this.running) {
      return;
    }

    await this.state.init();
    this.running = true;
    chrome.alarms.onAlarm.addListener(this.alarmListener);
    await this.scheduleNext(0);
  }

  async stop() {
    if (!this.running) {
      return;
    }

    this.running = false;
    chrome.alarms.onAlarm.removeListener(this.alarmListener);
    await chrome.alarms.clear(this.config.alarmName);
  }

  async scheduleNext(delayMs) {
    if (!this.running) {
      return;
    }

    const delayInMinutes = Math.max((delayMs ?? this.config.iterationIntervalMs) / 60_000, 0.016);
    await chrome.alarms.clear(this.config.alarmName);
    chrome.alarms.create(this.config.alarmName, {
      delayInMinutes,
    });
  }

  async handleAlarm(alarm) {
    if (!this.running || alarm.name !== this.config.alarmName) {
      return;
    }

    try {
      await this.runCycle();
      await this.scheduleNext(this.config.iterationIntervalMs);
    } catch (error) {
      this.logger?.error?.("Agent loop cycle failed", { message: error.message });
      await this.scheduleNext(this.config.failureBackoffMs);
    }
  }

  async runCycle() {
    const goal = await this.state.pullNextGoal();
    if (!goal) {
      this.logger?.info?.("Agent idle", { reason: "no-goal" });
      await this.scheduleNext(this.config.idleIntervalMs);
      return;
    }

    this.logger?.info?.("Agent executing goal", { goalId: goal.id, title: goal.title });

    const plannerMessages = [
      { role: "system", content: buildPlannerSystemPrompt(goal) },
      { role: "user", content: goal.prompt },
    ];

    let plannerResult;
    try {
      plannerResult = await this.providers.invoke("planner", plannerMessages, {
        expectJson: true,
      });
    } catch (error) {
      await this.state.recordFailure({ goalId: goal.id, error, requeue: true });
      this.logger?.error?.("Planner invocation failed", { goalId: goal.id, error: error.message });
      await sleep(jitter(this.config.failureBackoffMs));
      return;
    }

    await this.state.recordPlannerDecision({
      goalId: goal.id,
      plan: plannerResult.text,
      provider: plannerResult.provider,
    });

    if (!plannerResult.action || !plannerResult.action.name) {
      this.logger?.warn?.("Planner returned no actionable result", { goalId: goal.id });
      await this.state.recordFailure({ goalId: goal.id, error: new Error("No action returned"), requeue: false });
      await this.state.completeGoal({
        status: "failed",
        summary: "Planner did not return an action",
      });
      return;
    }

    const actionContext = {
      goal,
      input: plannerResult.action.params ?? {},
      plan: plannerResult,
      logger: this.logger,
    };

    let actionResult;
    try {
      actionResult = await this.actions.run(plannerResult.action.name, actionContext);
    } catch (error) {
      await this.state.recordFailure({ goalId: goal.id, error, requeue: true });
      this.logger?.error?.("Action execution failed", { goalId: goal.id, error: error.message });
      return;
    }

    await this.state.recordAction({
      goalId: goal.id,
      action: plannerResult.action,
      result: actionResult,
      providerResponse: plannerResult,
    });

    if (actionResult.terminal) {
      await this.state.completeGoal({
        status: actionResult.status ?? "success",
        summary: plannerResult.text,
        observation: actionResult.observation,
      });
      this.logger?.info?.("Goal completed", { goalId: goal.id, status: actionResult.status });
      return;
    }

    await this.state.requeueCurrentGoal({
      delayMs: this.config.iterationIntervalMs,
      reason: "non-terminal-action",
    });
    this.logger?.info?.("Goal requeued", { goalId: goal.id });
  }
}

export { AgentLoop };
