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
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });

  const resText = await res.text();

  if (!res.ok) {
    throw new Error(`Wyscout API error ${res.status}: ${resText}`);
  }

  return JSON.parse(resText) as Promise<T>;
}
