// Vercel Node.js serverless entry for TanStack Start.
// dist/server/server.js exports a fetch-style handler as `default`.
import handler from "../dist/server/server.js";

export default async function vercelHandler(req, res) {
  const url = `https://${req.headers.host}${req.url ?? "/"}`;
  const hasBody = !["GET", "HEAD"].includes(req.method ?? "GET");
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: hasBody ? req : undefined,
    duplex: "half",
  });

  const response = await handler.fetch(request);
  res.statusCode = response.status;
  response.headers.forEach((v, k) => {
    if (k !== "content-encoding" && k !== "transfer-encoding") res.setHeader(k, v);
  });
  if (response.body) {
    const reader = response.body.getReader();
    (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    })().catch(() => res.end());
  } else {
    res.end();
  }
}
