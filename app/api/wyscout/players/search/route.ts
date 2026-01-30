import { NextRequest, NextResponse } from "next/server";
import { wyscoutFetch } from "@/lib/wyscout";

function extractPlayerList(data: Record<string, unknown>): unknown[] {
  if (Array.isArray(data)) return data;
  const direct = data.players ?? data.items ?? data.results ?? data.data;
  if (Array.isArray(direct)) return direct;
  if (direct && typeof direct === "object" && "players" in direct) {
    const inner = (direct as Record<string, unknown>).players;
    if (Array.isArray(inner)) return inner;
  }
  if (direct && typeof direct === "object" && "items" in direct) {
    const inner = (direct as Record<string, unknown>).items;
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/b739254f-bde5-4543-b9f5-ea67cd2323cb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "app/api/wyscout/players/search/route.ts:GET",
      message: "Search route entry",
      data: { q, hasQ: !!q, trim: q?.trim() },
      timestamp: Date.now(),
      sessionId: "debug-session",
      hypothesisId: "E",
    }),
  }).catch(() => {});
  // #endregion
  if (!q || q.trim() === "") {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  try {
    let data = await wyscoutFetch<Record<string, unknown>>(
      "/search",
      { query: q.trim(), objType: "player" },
      "v3"
    );
    let players = extractPlayerList(data);
    if (players.length === 0) {
      data = await wyscoutFetch<Record<string, unknown>>(
        "/search",
        { q: q.trim(), type: "player" },
        "v3"
      );
      players = extractPlayerList(data);
    }
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/b739254f-bde5-4543-b9f5-ea67cd2323cb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/api/wyscout/players/search/route.ts:afterFetch",
        message: "Search normalized",
        data: {
          dataKeys: Object.keys(data as object),
          playersLength: players.length,
          firstPlayerKeys: players[0] ? Object.keys(players[0] as object) : null,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "A,D,E",
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.json({ players });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Wyscout API error";
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/b739254f-bde5-4543-b9f5-ea67cd2323cb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/api/wyscout/players/search/route.ts:catch",
        message: "Search error",
        data: { message },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "C",
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}
