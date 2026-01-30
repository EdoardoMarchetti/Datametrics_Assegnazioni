import { NextRequest, NextResponse } from "next/server";
import { wyscoutFetch } from "@/lib/wyscout";

type TeamResponse = Record<string, unknown>;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Team id is required" }, { status: 400 });
  }
  const detailsParam = request.nextUrl.searchParams.get("details");
  const paramsObj = detailsParam ? { details: detailsParam } : undefined;
  try {
    const data = await wyscoutFetch<TeamResponse>(
      `/teams/${id}`,
      paramsObj ?? {},
      "v3"
    );
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Wyscout API error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
