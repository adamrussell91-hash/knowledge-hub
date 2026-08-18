export async function queueCuratorRun(input: {
  origin: string;
  cookie?: string;
  secret: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${input.origin.replace(/\/$/, "")}/.netlify/functions/curator-run-background`, {
    method: "POST",
    headers: {
      cookie: input.cookie ?? "",
      "x-curator-run": input.secret,
    },
  });
  if (!response.ok && response.status !== 202) {
    const text = await response.text().catch(() => "");
    throw new Error(`curator run failed ${response.status}${text ? `: ${text}` : ""}`);
  }
}
