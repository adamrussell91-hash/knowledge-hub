import { completeChatWrite } from "../../src/chat/completeWrite";
import type { ChatMessage } from "../../src/chat/messages";
import type { ChatWriteState } from "../../src/chat/writeHttp";
import type { ResearchResult } from "../../src/research/schema";

const ALARM_DELAY_MS = 50;

type WriteRecord = ChatWriteState & {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  webSearch?: boolean;
};

export interface ChatWriteEnv {
  ANTHROPIC_API_KEY: string;
}

export class ChatWrite {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: ChatWriteEnv,
  ) {}

  private async load(): Promise<WriteRecord | null> {
    return (await this.ctx.storage.get<WriteRecord>("state")) ?? null;
  }

  private async save(state: WriteRecord) {
    await this.ctx.storage.put("state", state);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/start")) {
      const body = (await request.json()) as {
        writeSessionId: string;
        system: string;
        messages: ChatMessage[];
        maxTokens?: number;
        research?: ResearchResult;
        archiveFailed?: boolean;
        webSearch?: boolean;
      };
      const state: WriteRecord = {
        writeSessionId: body.writeSessionId,
        status: "writing",
        system: body.system,
        messages: body.messages,
        maxTokens: body.maxTokens,
        research: body.research,
        archiveFailed: body.archiveFailed,
        webSearch: body.webSearch === true,
      };
      await this.save(state);
      await this.ctx.storage.setAlarm(Date.now() + ALARM_DELAY_MS);
      return Response.json({
        writeSessionId: body.writeSessionId,
        status: "writing",
        research: body.research,
        archiveFailed: body.archiveFailed,
      });
    }

    if (request.method === "GET") {
      const state = await this.load();
      if (!state) return Response.json({ error: "Unknown write session" }, { status: 404 });
      return Response.json({
        writeSessionId: state.writeSessionId,
        status: state.status,
        reply: state.reply,
        error: state.error,
        research: state.research,
        archiveFailed: state.archiveFailed,
      });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }

  async alarm() {
    const state = await this.load();
    if (!state || state.status !== "writing") return;
    try {
      const reply = await completeChatWrite({
        system: state.system,
        messages: state.messages,
        apiKey: this.env.ANTHROPIC_API_KEY,
        maxTokens: state.maxTokens,
        webSearch: state.webSearch,
      });
      await this.save({ ...state, status: "done", reply });
    } catch (error) {
      await this.save({ ...state, status: "error", error: String(error) });
    }
  }
}
