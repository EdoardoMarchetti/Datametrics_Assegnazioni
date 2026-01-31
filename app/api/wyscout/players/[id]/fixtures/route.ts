import { NextRequest, NextResponse } from "next/server";
import { wyscoutFetch } from "@/lib/wyscout";

type FixtureRecord = Record<string, unknown>;

function toList(data: unknown): FixtureRecord[] {
  if (Array.isArray(data)) return data as FixtureRecord[];
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const arr = d.fixtures ?? d.matches ?? d.elements;
    if (Array.isArray(arr)) return arr as FixtureRecord[];
  }
  return [];
}

function toMatchRecord(item: FixtureRecord): FixtureRecord {
  const inner = item.match;
  if (inner && typeof inner === "object") return inner as FixtureRecord;
  return item;
}

function getId(f: FixtureRecord, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = f[k];
    if (k === "round" && v && typeof v === "object") {
      const r = v as Record<string, unknown>;
      if (r.roundId != null) return String(r.roundId);
      if (r.wyId != null) return String(r.wyId);
      continue;
    }
    if (v != null && v !== "") return String(v);
    const nested = f.competition as Record<string, unknown> | undefined;
    if (nested && k === "areaId" && nested.areaId != null)
      return String(nested.areaId);
  }
  return null;
}

function getGameweek(f: FixtureRecord): number | null {
  const gw =
    f.gameweek ??
    f.gameWeek ??
    (f.round && typeof f.round === "object" && (f.round as Record<string, unknown>).gameweek);
  if (typeof gw === "number" && !Number.isNaN(gw)) return gw;
  if (typeof gw === "string") {
    const n = parseInt(gw, 10);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function getMatchDate(m: FixtureRecord): string | null {
  // Prefer dateutc (ISO-like) so Date parsing works; "date" is often human-readable and can fail
  const d = m.dateutc ?? m.date ?? m.startDate;
  if (typeof d === "string" && d) return d;
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "Player id is required" },
      { status: 400 }
    );
  }

  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const fromDate = fromParam ?? new Date().toISOString().slice(0, 10);
  const toDate = toParam ?? "";

  const queryParams: Record<string, string> = { fromDate };
  if (toDate) queryParams.toDate = toDate;

  try {
    const data = await wyscoutFetch<unknown>(
      `/players/${id}/fixtures`,
      queryParams,
      "v3"
    );
    const list = toList(data);
    if (list.length === 0) return NextResponse.json({ fixtures: [] });

    const compIds = new Set<string>();
    const seasonIds = new Set<string>();
    const roundIds = new Set<string>();
    const areaIds = new Set<string>();
    for (const f of list) {
      const cid = getId(f, "competitionId", "compId");
      if (cid) compIds.add(cid);
      const sid = getId(f, "seasonId");
      if (sid) seasonIds.add(sid);
      const rid = getId(f, "roundId", "round");
      if (rid) roundIds.add(rid);
      const aid = getId(f, "areaId") ?? (f.competition as Record<string, unknown>)?.["areaId"] as string | undefined;
      if (aid) areaIds.add(String(aid));
    }

    const [areasRes, ...compSeasonRound] = await Promise.all([
      wyscoutFetch<{ areas?: { wyId?: number; id?: number; name?: string }[] }>("/areas", undefined, "v3"),
      ...Array.from(compIds).map((cid) =>
        wyscoutFetch<{ name?: string; areaId?: string }>(`/competitions/${cid}`, undefined, "v3")
      ),
      ...Array.from(seasonIds).map((sid) =>
        wyscoutFetch<{ name?: string }>(`/seasons/${sid}`, undefined, "v3")
      ),
      ...Array.from(roundIds).map((rid) =>
        wyscoutFetch<{ name?: string }>(`/rounds/${rid}`, undefined, "v3")
      ),
    ]);

    const areaMap: Record<string, string> = {};
    const areasRaw = Array.isArray(areasRes) ? areasRes : (areasRes as Record<string, unknown>)?.areas;
    const areas = Array.isArray(areasRaw) ? areasRaw : [];
    for (const a of areas) {
      const x = a as Record<string, unknown>;
      const id = String(x.wyId ?? x.id ?? "");
      if (id && x.name) areaMap[id] = String(x.name);
    }

    const compList = compSeasonRound.slice(0, compIds.size) as { name?: string; areaId?: string; area?: { wyId?: number; id?: number } }[];
    const seasonList = compSeasonRound.slice(compIds.size, compIds.size + seasonIds.size) as { name?: string }[];
    const roundList = compSeasonRound.slice(compIds.size + seasonIds.size) as { name?: string }[];
    const compMap: Record<string, string> = {};
    const compAreaIdMap: Record<string, string> = {};
    Array.from(compIds).forEach((id, i) => {
      const c = compList[i];
      if (c?.name) compMap[id] = c.name;
      const areaId = c?.areaId ?? c?.area?.wyId ?? c?.area?.id;
      if (areaId != null) compAreaIdMap[id] = String(areaId);
    });
    const seasonMap: Record<string, string> = {};
    Array.from(seasonIds).forEach((id, i) => {
      if (seasonList[i]?.name) seasonMap[id] = seasonList[i].name!;
    });
    const roundMap: Record<string, string> = {};
    Array.from(roundIds).forEach((id, i) => {
      if (roundList[i]?.name) roundMap[id] = roundList[i].name!;
    });

    const seasonMatchesSettled = await Promise.allSettled(
      Array.from(seasonIds).map((sid) =>
        wyscoutFetch<unknown>(`/seasons/${sid}/fixtures`, { details: "matches" }, "v3")
      )
    );

    const gameweekRanges: Record<string, { start: string; end: string }> = {};
    const gameweekMatchesMap: Record<string, FixtureRecord[]> = {};
    const roundMatchesMap: Record<string, FixtureRecord[]> = {};
    const seasonMatchesMap: Record<string, FixtureRecord[]> = {};
    seasonMatchesSettled.forEach((result, idx) => {
      if (result.status === "rejected") return;
      const seasonId = Array.from(seasonIds)[idx];
      const rawPayload = result.value;
      const raw = toList(rawPayload);
      const matches = raw
        .map(toMatchRecord)
        .filter((m) => getId(m, "seasonId") === seasonId);
      seasonMatchesMap[seasonId] = matches;

      // roundMatches: chiave seasonId-roundId. In campionato lo stesso roundId può valere
      // per tutte le giornate (es. "Regular season"), quindi la lista può essere ~380 partite.
      const byRoundKey: Record<string, FixtureRecord[]> = {};
      for (const m of matches) {
        const roundId = getId(m, "roundId", "round");
        if (!roundId) continue;
        const keyRound = `${seasonId}-${roundId}`;
        if (!byRoundKey[keyRound]) byRoundKey[keyRound] = [];
        byRoundKey[keyRound].push(m);
      }
      for (const [keyRound, arr] of Object.entries(byRoundKey)) {
        roundMatchesMap[keyRound] = arr;
      }

      // gameweekMatches: chiave seasonId-roundId-gameweek. Filtra per giornata (es. solo 10 partite
      // della giornata 23). roundId/gameweek/date possono essere sul wrapper fixture, non sul match.
      const byKey: Record<string, string[]> = {};
      const byKeyMatches: Record<string, FixtureRecord[]> = {};
      for (const wrapper of raw) {
        const m = toMatchRecord(wrapper);
        if (getId(m, "seasonId") !== seasonId) continue;
        const roundId = getId(wrapper, "roundId", "round") ?? getId(m, "roundId", "round");
        const gw = getGameweek(wrapper) ?? getGameweek(m);
        const dateStr = getMatchDate(wrapper) ?? getMatchDate(m);
        if (!roundId || gw == null || !dateStr) continue;
        const key = `${seasonId}-${roundId}-${gw}`;
        if (!byKey[key]) byKey[key] = [];
        byKey[key].push(dateStr);
        if (!byKeyMatches[key]) byKeyMatches[key] = [];
        byKeyMatches[key].push(m);
      }
      for (const [key, dates] of Object.entries(byKey)) {
        gameweekMatchesMap[key] = byKeyMatches[key] ?? [];
        if (dates.length === 0) continue;
        const parsed = dates.map((d) => new Date(d).getTime()).filter((t) => !Number.isNaN(t));
        if (parsed.length === 0) continue;
        const min = new Date(Math.min(...parsed));
        const max = new Date(Math.max(...parsed));
        gameweekRanges[key] = {
          start: min.toISOString().slice(0, 10),
          end: max.toISOString().slice(0, 10),
        };
      }
    });

    const enriched = list.map((f) => {
      const compId = getId(f, "competitionId", "compId");
      const seasonId = getId(f, "seasonId");
      const roundId = getId(f, "roundId", "round");
      const gw = getGameweek(f);
      const aid =
        getId(f, "areaId") ??
        (f.competition as Record<string, unknown>)?.["areaId"] ??
        (compId ? compAreaIdMap[compId] : null);
      const lookupKey =
        seasonId && roundId && gw != null ? `${seasonId}-${roundId}-${gw}` : null;
      const range = lookupKey ? gameweekRanges[lookupKey] : undefined;
      const roundKey = seasonId && roundId ? `${seasonId}-${roundId}` : null;
      const roundMatches = roundKey ? roundMatchesMap[roundKey] ?? [] : [];
      const gameweekMatches = lookupKey ? gameweekMatchesMap[lookupKey] ?? [] : [];
      const seasonMatches = seasonId ? seasonMatchesMap[seasonId] ?? [] : [];
      return {
        ...f,
        areaName: aid ? areaMap[String(aid)] : undefined,
        competitionName: compId ? compMap[compId] : undefined,
        seasonName: seasonId ? seasonMap[seasonId] : undefined,
        roundName: roundId ? roundMap[roundId] : undefined,
        gameweekStartDate: range?.start,
        gameweekEndDate: range?.end,
        deliveryDate: range?.end
          ? (() => {
              const d = new Date(range.end + "T12:00:00");
              d.setDate(d.getDate() + 1);
              return d.toISOString().slice(0, 10);
            })()
          : undefined,
        seasonId: seasonId ?? undefined,
        roundId: roundId ?? undefined,
        gameweekMatches,
        roundMatches,
        seasonMatches,
      };
    });

    return NextResponse.json({ fixtures: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Wyscout API error";
    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}
