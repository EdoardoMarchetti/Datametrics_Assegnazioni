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
    return NextResponse.json({ players });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Wyscout API error";
    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}
