const WYSCOUT_BASE = {
  v2: "https://apirest.wyscout.com/v2",
  v3: "https://apirest.wyscout.com/v3",
} as const;

export type WyscoutVersion = keyof typeof WYSCOUT_BASE;

export async function wyscoutFetch<T = unknown>(
  path: string,
  params?: Record<string, string>,
  version: WyscoutVersion = "v3"
): Promise<T> {
  const username = process.env.WYSCOUT_USERNAME;
  const password = process.env.WYSCOUT_PASSWORD;

  if (!username || !password) {
    throw new Error("WYSCOUT_USERNAME and WYSCOUT_PASSWORD must be set");
  }

  const base = WYSCOUT_BASE[version];
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${base}/`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/b739254f-bde5-4543-b9f5-ea67cd2323cb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "lib/wyscout.ts:wyscoutFetch",
      message: "Wyscout request",
      data: { url: url.toString(), version, path, paramKeys: params ? Object.keys(params) : [] },
      timestamp: Date.now(),
      sessionId: "debug-session",
      hypothesisId: "B",
    }),
  }).catch(() => {});
  // #endregion
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });

  const resText = await res.text();
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/b739254f-bde5-4543-b9f5-ea67cd2323cb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "lib/wyscout.ts:afterFetch",
      message: "Wyscout response",
      data: {
        status: res.status,
        ok: res.ok,
        bodyKeys: (() => {
          try {
            const j = JSON.parse(resText);
            return Array.isArray(j) ? "array" : Object.keys(j);
          } catch {
            return "parseError";
          }
        })(),
        bodySample: resText.slice(0, 300),
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      hypothesisId: "A,C,D",
    }),
  }).catch(() => {});
  // #endregion

  if (!res.ok) {
    throw new Error(`Wyscout API error ${res.status}: ${resText}`);
  }

  return JSON.parse(resText) as Promise<T>;
}
