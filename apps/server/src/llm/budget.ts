import type { ServerConfig } from '../config.js';

/** Counts events in a sliding one-minute window and refuses once the window is full. */
export class SlidingWindowLimiter {
  private readonly stamps: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now
  ) {}

  tryTake(): boolean {
    const t = this.now();
    while (this.stamps.length && t - this.stamps[0] >= this.windowMs) this.stamps.shift();
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(t);
    return true;
  }
}

const budgets = new WeakMap<ServerConfig, SlidingWindowLimiter>();

/**
 * Server-wide budget for server-key LLM calls that do not pass through a Fastify route limit (MCP tools).
 * One budget per config object, so every stateless MCP request of one server shares it.
 */
export function serverLlmBudget(config: ServerConfig): SlidingWindowLimiter {
  let b = budgets.get(config);
  if (!b) {
    b = new SlidingWindowLimiter(Math.max(1, config.llmRateLimitPerMin));
    budgets.set(config, b);
  }
  return b;
}

export const LLM_BUDGET_EXCEEDED =
  'Limit für Server-LLM-Aufrufe erreicht (pro Minute). Bitte kurz warten oder useServerLlm: false nutzen (llmBriefing für das eigene LLM).';
