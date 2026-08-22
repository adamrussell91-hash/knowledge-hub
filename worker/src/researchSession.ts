import { applyCancel, initialSession, sessionToResult, type SessionState } from "../../src/research/round";
import { runDeepRoundKernel, type KernelEnv } from "../../src/research/kernel";

const ALARM_DELAY_MS = 250;

export interface ResearchEnv extends KernelEnv {
  RESEARCH_SESSION: DurableObjectNamespace;
  RESEARCH_KERNEL_SHARED_SECRET: string;
  TEACHING_HUB_ORIGIN?: string;
}

export class ResearchSession {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: ResearchEnv,
  ) {}

  private async loadState(): Promise<SessionState | null> {
    return (await this.ctx.storage.get<SessionState>("state")) ?? null;
  }

  private async saveState(state: SessionState) {
    await this.ctx.storage.put("state", state);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/start")) {
      const body = (await request.json()) as {
        sessionId: string;
        query: string;
        documentContext?: string;
        k?: number;
        tags?: string[];
        maxRounds?: number;
        negation?: boolean;
      };
      // Kick off only. Round 1 used to run inline so the HTTP caller got
      // findings immediately — that made Netlify the clock. Every round,
      // including the first, runs on the alarm so a sitting can last minutes.
      const state = initialSession({
        query: body.query,
        documentContext: body.documentContext,
        now: Date.now(),
        k: body.k,
        tags: body.tags,
        maxRounds: body.maxRounds,
        negation: body.negation,
      });
      await this.saveState(state);
      await this.ctx.storage.setAlarm(Date.now() + ALARM_DELAY_MS);
      return Response.json({
        sessionId: body.sessionId,
        status: "running",
        result: sessionToResult(state),
      });
    }

    if (request.method === "GET") {
      const state = await this.loadState();
      if (!state) return Response.json({ error: "Unknown session" }, { status: 404 });
      return Response.json(sessionToResult(state));
    }

    if (request.method === "POST" && url.pathname.endsWith("/cancel")) {
      const state = await this.loadState();
      if (!state) return Response.json({ error: "Unknown session" }, { status: 404 });
      await this.ctx.storage.deleteAlarm();
      const cancelled = applyCancel(state);
      await this.saveState(cancelled);
      return Response.json({ status: "cancelled" });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }

  async alarm() {
    const state = await this.loadState();
    if (!state || state.status !== "running") return;
    const next = await runDeepRoundKernel(state, this.env);
    await this.saveState(next);
    if (next.status === "running") {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_DELAY_MS);
    }
  }
}
