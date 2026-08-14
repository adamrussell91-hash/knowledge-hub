import { handleResearchRequest } from "../../src/research/http";
import { runQuickKernel } from "../../src/research/kernel";
import { ResearchSession, type ResearchEnv } from "./researchSession";

export { ResearchSession };

export default {
  async fetch(request: Request, env: ResearchEnv): Promise<Response> {
    return handleResearchRequest(request, {
      secret: env.RESEARCH_KERNEL_SHARED_SECRET,
      allowedOrigin: env.TEACHING_HUB_ORIGIN ?? "*",
      runQuick: input => runQuickKernel(input, env),
      startDeep: async input => {
        const sessionId = crypto.randomUUID();
        const stub = env.RESEARCH_SESSION.get(env.RESEARCH_SESSION.idFromName(sessionId));
        const response = await stub.fetch(
          new Request("https://session/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, ...input }),
          }),
        );
        if (!response.ok) throw new Error(`Session start failed ${response.status}`);
        return response.json();
      },
      getDeep: async sessionId => {
        const stub = env.RESEARCH_SESSION.get(env.RESEARCH_SESSION.idFromName(sessionId));
        const response = await stub.fetch(new Request("https://session/"));
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Session get failed ${response.status}`);
        return response.json();
      },
      cancelDeep: async sessionId => {
        const stub = env.RESEARCH_SESSION.get(env.RESEARCH_SESSION.idFromName(sessionId));
        const response = await stub.fetch(new Request("https://session/cancel", { method: "POST" }));
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Session cancel failed ${response.status}`);
        return response.json();
      },
    });
  },
};
