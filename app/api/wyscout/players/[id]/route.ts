import { NextRequest, NextResponse } from "next/server";
import { wyscoutFetch } from "@/lib/wyscout";

type PlayerResponse = Record<string, unknown>;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Player id is required" }, { status: 400 });
  }
  const detailsParam = request.nextUrl.searchParams.get("details");
  const details = detailsParam ?? "currentTeam";
  try {
    const data = await wyscoutFetch<PlayerResponse>(
      `/players/${id}`,
      { details },
      "v3"
    );
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Wyscout API error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
