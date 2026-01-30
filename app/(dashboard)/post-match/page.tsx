"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";

const DEBOUNCE_MS = 350;
const MIN_SEARCH_LENGTH = 2;

type Player = {
  wyId?: number;
  id?: number;
  shortName?: string;
  firstName?: string;
  lastName?: string;
  currentTeam?: { name?: string; wyId?: number; id?: number };
  role?: { name?: string };
  imageDataURL?: string;
  teamImageDataURL?: string;
  [key: string]: unknown;
};

type GameweekMatch = {
  matchId?: number;
  date?: string;
  dateutc?: string;
  label?: string;
  roundId?: number | string;
  gameweek?: number;
  [key: string]: unknown;
};

type Fixture = {
  matchId?: number;
  wyId?: number;
  date?: string;
  dateutc?: string;
  label?: string;
  gameweek?: number;
  round?: { name?: string; roundId?: number };
  homeTeamId?: number;
  awayTeamId?: number;
  homeTeam?: { name?: string };
  awayTeam?: { name?: string };
  competition?: { name?: string; area?: { name?: string } };
  season?: { name?: string };
  areaName?: string;
  competitionName?: string;
  seasonName?: string;
  roundName?: string;
  gameweekStartDate?: string;
  gameweekEndDate?: string;
  /** Data di consegna; default = giorno dopo fine gameweek */
  deliveryDate?: string;
  seasonId?: string;
  roundId?: string;
  gameweekMatches?: GameweekMatch[];
  roundMatches?: GameweekMatch[];
  seasonMatches?: GameweekMatch[];
  playerNames?: string[];
  playersInMatch?: Player[];
  [key: string]: unknown;
};

type AssignableUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

type FixtureAssignment = {
  reportUserId: string;
  videoEnabled: boolean;
  videoUserId: string | null;
};

/** Remove trailing ", 0-0" (or any score) from match label */
function stripScoreFromLabel(label: string): string {
  return label.replace(/,\s*\d+-\d+\s*$/, "").trim();
}

/** Data di consegna: deliveryDate se presente, altrimenti giorno dopo fine gameweek */
function getDeliveryDate(f: Fixture): string {
  if (f.deliveryDate) return f.deliveryDate;
  if (f.gameweekEndDate) {
    const d = new Date(f.gameweekEndDate + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  return "";
}

function getEffectiveDeliveryDate(
  rowKey: string,
  f: Fixture,
  overrides: Record<string, string>
): string {
  return overrides[rowKey] ?? getDeliveryDate(f);
}

type GanttTask = {
  userId: string;
  userName: string;
  start: Date;
  end: Date;
  label: string;
  type: "report" | "video";
  matchId: number;
  playerLabel?: string;
  /** Chiave in fixtureAssignments (rowKey o rowKey-playerId) per aggiornare assegnazione al drop */
  assignmentKey: string;
};

function buildGanttTasks(
  fixtures: Fixture[],
  fixtureAssignments: Record<string, FixtureAssignment>,
  assignableUsers: AssignableUser[],
  deliveryDateOverrides: Record<string, string>
): GanttTask[] {
  const userDisplay = (id: string): string => {
    if (!id) return "";
    const u = assignableUsers.find((x) => x.id === id);
    return u ? (u.full_name ?? u.email ?? id) : id;
  };
  const tasks: GanttTask[] = [];
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const rowKey = String(f.matchId ?? f.wyId ?? i);
    const matchDateStr = f.date ?? f.dateutc;
    const matchDate = matchDateStr ? new Date(matchDateStr) : null;
    let endDate: Date | null = null;
    const deliveryDateStr = getEffectiveDeliveryDate(rowKey, f, deliveryDateOverrides);
    if (deliveryDateStr) {
      endDate = new Date(deliveryDateStr + "T23:59:59");
    } else if (f.gameweekEndDate) {
      const d = new Date(f.gameweekEndDate + "T12:00:00");
      d.setDate(d.getDate() + 1);
      d.setHours(23, 59, 59, 999);
      endDate = d;
    } else if (matchDate) {
      const d = new Date(matchDate);
      const day = d.getDay();
      const toSunday = day === 0 ? 0 : 7 - day;
      d.setDate(d.getDate() + toSunday + 1);
      d.setHours(23, 59, 59, 999);
      endDate = d;
    }
    if (!matchDate || !endDate || Number.isNaN(matchDate.getTime()) || Number.isNaN(endDate.getTime())) continue;
    const matchLabel = stripScoreFromLabel(
      f.label ?? (f.homeTeam?.name && f.awayTeam?.name ? `${f.homeTeam.name} – ${f.awayTeam.name}` : `Match ${f.matchId ?? f.wyId ?? i}`)
    );
    const players = f.playersInMatch ?? [];
    if (players.length === 0) {
      const assign = fixtureAssignments[rowKey] ?? {};
      const reportUserId = assign.reportUserId;
      const videoUserId = assign.videoUserId;
      if (reportUserId) {
        tasks.push({
          userId: reportUserId,
          userName: userDisplay(reportUserId),
          start: new Date(matchDate.getTime()),
          end: endDate,
          label: matchLabel,
          type: "report",
          matchId: f.matchId ?? f.wyId ?? i,
          assignmentKey: rowKey,
        });
      }
      if (videoUserId && videoUserId !== reportUserId) {
        tasks.push({
          userId: videoUserId,
          userName: userDisplay(videoUserId),
          start: new Date(matchDate.getTime()),
          end: endDate,
          label: matchLabel,
          type: "video",
          matchId: f.matchId ?? f.wyId ?? i,
          assignmentKey: rowKey,
        });
      }
    } else {
      for (const p of players) {
        const pid = p.wyId ?? p.id;
        const playerLabel = (p.shortName ?? ([p.firstName, p.lastName].filter(Boolean).join(" ") || (pid != null ? `#${pid}` : ""))) as string;
        const key = pid != null ? `${rowKey}-${pid}` : rowKey;
        const assign = fixtureAssignments[key] ?? {};
        const reportUserId = assign.reportUserId;
        const videoUserId = assign.videoUserId;
        const suffix = playerLabel ? ` (${playerLabel})` : "";
        if (reportUserId) {
          tasks.push({
            userId: reportUserId,
            userName: userDisplay(reportUserId),
            start: new Date(matchDate.getTime()),
            end: endDate,
            label: matchLabel + suffix,
            type: "report",
            matchId: f.matchId ?? f.wyId ?? i,
            playerLabel,
            assignmentKey: key,
          });
        }
        if (videoUserId && videoUserId !== reportUserId) {
          tasks.push({
            userId: videoUserId,
            userName: userDisplay(videoUserId),
            start: new Date(matchDate.getTime()),
            end: endDate,
            label: matchLabel + suffix,
            type: "video",
            matchId: f.matchId ?? f.wyId ?? i,
            playerLabel,
            assignmentKey: key,
          });
        }
      }
    }
  }
  return tasks;
}

function escapeCsvCell(val: string): string {
  const s = String(val ?? "").trim();
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fixturesToCsv(
  fixtures: Fixture[],
  fixtureAssignments: Record<string, FixtureAssignment>,
  assignableUsers: AssignableUser[],
  deliveryDateOverrides: Record<string, string>
): string {
  const userDisplay = (id: string): string => {
    if (!id) return "";
    const u = assignableUsers.find((x) => x.id === id);
    return u ? (u.full_name ?? u.email ?? id) : id;
  };
  const userIds = new Set<string>();
  Object.values(fixtureAssignments).forEach((a) => {
    if (a.reportUserId) userIds.add(a.reportUserId);
    if (a.videoUserId) userIds.add(a.videoUserId);
  });
  const sortedUserIds = Array.from(userIds).sort((a, b) =>
    userDisplay(a).localeCompare(userDisplay(b), "it", { sensitivity: "base" })
  );
  const header = [
    "Giocatore",
    "Data",
    "Label",
    "Area / Competizione / Stagione / Round",
    "Gameweek",
    "Gameweek inizio",
    "Gameweek fine",
    "Data di consegna",
    "Match ID",
    ...sortedUserIds.map((id) => userDisplay(id) || id),
  ];
  const roleForUser = (assign: FixtureAssignment, userId: string): string => {
    const isReport = assign.reportUserId === userId;
    const isVideo = assign.videoUserId === userId;
    if (isReport) return "report";
    if (isVideo) return "video";
    return "";
  };
  const rows: string[][] = [];
  fixtures.forEach((f, i) => {
    const rowKey = String(f.matchId ?? f.wyId ?? i);
    const dateStr = f.date ?? f.dateutc ?? "";
    const dateFormatted = dateStr
      ? new Date(dateStr).toLocaleDateString("it-IT")
      : "";
    const labelRaw =
      f.label ??
      (f.homeTeam?.name && f.awayTeam?.name
        ? `${f.homeTeam.name} – ${f.awayTeam.name}`
        : f.homeTeamId && f.awayTeamId
          ? `Team ${f.homeTeamId} – Team ${f.awayTeamId}`
          : "");
    const label = stripScoreFromLabel(String(labelRaw ?? ""));
    const area = f.areaName ?? f.competition?.area?.name ?? "";
    const comp = f.competitionName ?? f.competition?.name ?? "";
    const season = f.seasonName ?? f.season?.name ?? "";
    const roundLabel =
      f.roundName ??
      (typeof f.round === "object" && f.round?.name
        ? f.round.name
        : typeof f.round === "number"
          ? String(f.round)
          : f.round ?? "");
    const parts = [area, comp, season, roundLabel].filter(Boolean);
    const gameweek = f.gameweek != null ? String(f.gameweek) : "";
    const gwStart = f.gameweekStartDate
      ? new Date(f.gameweekStartDate).toLocaleDateString("it-IT")
      : "";
    const gwEnd = f.gameweekEndDate
      ? new Date(f.gameweekEndDate).toLocaleDateString("it-IT")
      : "";
    const effectiveDelivery = getEffectiveDeliveryDate(rowKey, f, deliveryDateOverrides);
    const deliveryDateStr = effectiveDelivery
      ? new Date(effectiveDelivery + "T12:00:00").toLocaleDateString("it-IT")
      : "";
    const matchId = String(f.matchId ?? f.wyId ?? "");
    const players = f.playersInMatch ?? [];
    if (players.length === 0) {
      const assign = fixtureAssignments[rowKey] ?? {};
      const userCols = sortedUserIds.map((uid) => roleForUser(assign, uid));
      rows.push(
        [
          "",
          dateFormatted,
          label,
          parts.join(" / "),
          gameweek,
          gwStart,
          gwEnd,
          deliveryDateStr,
          matchId,
          ...userCols,
        ].map(String).map(escapeCsvCell)
      );
    } else {
      for (const p of players) {
        const pid = p.wyId ?? p.id;
        const playerLabel =
          (p.shortName ?? ([p.firstName, p.lastName].filter(Boolean).join(" ") || (pid != null ? `#${pid}` : ""))) as string;
        const key = pid != null ? `${rowKey}-${pid}` : rowKey;
        const assign = fixtureAssignments[key] ?? {};
        const userCols = sortedUserIds.map((uid) => roleForUser(assign, uid));
        rows.push(
          [
            playerLabel,
            dateFormatted,
            label,
            parts.join(" / "),
            gameweek,
            gwStart,
            gwEnd,
            deliveryDateStr,
            matchId,
            ...userCols,
          ].map(String).map(escapeCsvCell)
        );
      }
    }
  });
  return [header.map(escapeCsvCell).join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** YYYY-MM-DD in local time (so calendar day matches user timezone) */
function toLocalDateKey(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Group fixtures by local date (YYYY-MM-DD) for calendar view */
function groupFixturesByDay(fixtures: Fixture[]): Map<string, Fixture[]> {
  const byDay = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const raw = f.date ?? f.dateutc ?? "";
    const d = new Date(raw);
    const key = toLocalDateKey(d);
    if (!key) continue;
    const list = byDay.get(key) ?? [];
    list.push(f);
    byDay.set(key, list);
  }
  byDay.forEach((list) => list.sort((a, b) => new Date(a.date ?? a.dateutc ?? 0).getTime() - new Date(b.date ?? b.dateutc ?? 0).getTime()));
  return byDay;
}

/** Monday = 1 in getDay(); return Monday of the week containing d */
function getMondayOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  return out;
}

/** Build calendar weeks (rows) for Notion-style grid: each row = 7 days Mon–Sun */
function buildCalendarWeeks(
  byDay: Map<string, Fixture[]>
): { dayKey: string; dayNum: number; month: number; year: number }[][] {
  const keys = Array.from(byDay.keys()).filter(Boolean).sort();
  if (keys.length === 0) return [];
  const minDate = new Date(keys[0] + "T12:00:00");
  const maxDate = new Date(keys[keys.length - 1] + "T12:00:00");
  const start = getMondayOfWeek(minDate);
  const end = new Date(maxDate);
  end.setDate(end.getDate() + (6 - (maxDate.getDay() + 6) % 7));
  const weeks: { dayKey: string; dayNum: number; month: number; year: number }[][] = [];
  let curr = new Date(start);
  while (curr <= end) {
    const row: { dayKey: string; dayNum: number; month: number; year: number }[] = [];
    for (let c = 0; c < 7; c++) {
      const key = toLocalDateKey(curr);
      row.push({
        dayKey: key,
        dayNum: curr.getDate(),
        month: curr.getMonth(),
        year: curr.getFullYear(),
      });
      curr.setDate(curr.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

/** Build calendar grouped by month for horizontal scroll: each month has its own grid */
function buildCalendarByMonth(
  byDay: Map<string, Fixture[]>
): { monthKey: string; monthLabel: string; weeks: { dayKey: string; dayNum: number; month: number; year: number }[][] }[] {
  const keys = Array.from(byDay.keys()).filter(Boolean).sort();
  if (keys.length === 0) return [];
  const monthSet = new Set<string>();
  for (const k of keys) {
    monthSet.add(k.slice(0, 7));
  }
  const months = Array.from(monthSet).sort();
  const result: { monthKey: string; monthLabel: string; weeks: { dayKey: string; dayNum: number; month: number; year: number }[][] }[] = [];
  for (const monthKey of months) {
    const [y, m] = monthKey.split("-").map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    const start = getMondayOfWeek(firstDay);
    const end = new Date(lastDay);
    end.setDate(end.getDate() + (6 - (lastDay.getDay() + 6) % 7));
    const weeks: { dayKey: string; dayNum: number; month: number; year: number }[][] = [];
    let curr = new Date(start);
    while (curr <= end) {
      const row: { dayKey: string; dayNum: number; month: number; year: number }[] = [];
      for (let c = 0; c < 7; c++) {
        const key = toLocalDateKey(curr);
        row.push({
          dayKey: key,
          dayNum: curr.getDate(),
          month: curr.getMonth(),
          year: curr.getFullYear(),
        });
        curr.setDate(curr.getDate() + 1);
      }
      weeks.push(row);
    }
    const monthLabel = firstDay.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    result.push({ monthKey, monthLabel, weeks });
  }
  return result;
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
function playerImageUrl(p: Player): string | null {
  const url = p.imageDataURL;
  return url && typeof url === "string" ? url : null;
}
function teamImageUrl(p: Player): string | null {
  const url = p.teamImageDataURL;
  return url && typeof url === "string" ? url : null;
}
const defaultDateFrom = () => new Date().toISOString().slice(0, 10);
const defaultDateTo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
};

export default function PostMatchPage() {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [fixturesLoading, setFixturesLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [fixturesError, setFixturesError] = useState<string | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(() => defaultDateFrom());
  const [dateTo, setDateTo] = useState(() => defaultDateTo());
  const [viewMode, setViewMode] = useState<"table" | "calendar" | "gantt">("table");
  const [calendarMonthKey, setCalendarMonthKey] = useState<string | null>(null);
  const [calendarPopupFixture, setCalendarPopupFixture] = useState<Fixture | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [fixtureAssignments, setFixtureAssignments] = useState<Record<string, FixtureAssignment>>({});
  const [deliveryDateOverrides, setDeliveryDateOverrides] = useState<Record<string, string>>({});
  const selectedPlayerIds = selectedPlayers.map((p) => p.wyId ?? p.id).filter((id): id is number => id != null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const calendarExportRef = useRef<HTMLDivElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [calendarExporting, setCalendarExporting] = useState(false);
  const [ganttTooltip, setGanttTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [hoveredGanttBar, setHoveredGanttBar] = useState<string | null>(null);
  const [ganttDropTargetUserId, setGanttDropTargetUserId] = useState<string | null>(null);
  const ganttTooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (viewMode !== "gantt") {
      setGanttTooltip(null);
      setHoveredGanttBar(null);
      setGanttDropTargetUserId(null);
    }
  }, [viewMode]);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: AssignableUser[] | { error?: string }) => {
        if (Array.isArray(data)) setAssignableUsers(data);
      })
      .catch(() => {});
  }, []);

  function getFixtureRowKey(f: Fixture, i: number): string {
    return String(f.matchId ?? f.wyId ?? i);
  }

  /** Key per (fixture, player) per assegnazioni report/video per giocatore */
  function assignmentKey(rowKey: string, playerId: number): string {
    return `${rowKey}-${playerId}`;
  }

  function getAssignment(key: string): FixtureAssignment {
    return (
      fixtureAssignments[key] ?? {
        reportUserId: "",
        videoEnabled: false,
        videoUserId: null,
      }
    );
  }

  function setReportUser(key: string, userId: string) {
    setFixtureAssignments((prev) => {
      const current = prev[key] ?? { reportUserId: "", videoEnabled: false, videoUserId: null };
      if (userId) {
        return { ...prev, [key]: { reportUserId: userId, videoEnabled: true, videoUserId: userId } };
      }
      return { ...prev, [key]: { reportUserId: "", videoEnabled: false, videoUserId: null } };
    });
  }

  function setVideoUser(key: string, userId: string | null) {
    setFixtureAssignments((prev) => {
      const current = prev[key] ?? { reportUserId: "", videoEnabled: false, videoUserId: null };
      return { ...prev, [key]: { ...current, videoUserId: userId || null } };
    });
  }

  const selectBaseClass =
    "dm-input w-full rounded-lg px-3 py-2 text-sm transition-colors focus:ring-2 focus:ring-dm-accent/30";

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < MIN_SEARCH_LENGTH) {
      setPlayers([]);
      setSearchError(null);
      setSearchLoading(false);
      setDropdownOpen(false);
      return;
    }
    const controller = new AbortController();
    if (searchAbortRef.current) searchAbortRef.current.abort();
    searchAbortRef.current = controller;

    setSearchError(null);
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/wyscout/players/search?q=${encodeURIComponent(trimmed)}`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      const data = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      const list = Array.isArray(data.players) ? data.players : [];
      setPlayers(list);
      setDropdownOpen(true);
      if (list.length === 0) setSearchError("Nessun giocatore trovato.");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setSearchError(err instanceof Error ? err.message : "Errore di ricerca");
      setPlayers([]);
    } finally {
      if (!controller.signal.aborted) setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (fixtures.length > 0 && viewMode === "calendar") {
      setCalendarMonthKey(null);
    }
  }, [fixtures.length, viewMode]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setCalendarPopupFixture(null);
    }
    if (calendarPopupFixture) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [calendarPopupFixture]);

  async function enrichPlayerWithImages(playerId: number) {
    try {
      const playerRes = await fetch(`/api/wyscout/players/${playerId}`).then((r) => r.json());
      const imageDataURL = (playerRes as { imageDataURL?: string })?.imageDataURL;
      const currentTeam = (playerRes as { currentTeam?: { wyId?: number; name?: string } })?.currentTeam;
      const teamWyId = currentTeam?.wyId;
      let teamImageDataURL: string | undefined;
      if (teamWyId != null) {
        const teamRes = await fetch(`/api/wyscout/teams/${teamWyId}`).then((r) => r.json());
        teamImageDataURL = (teamRes as { imageDataURL?: string })?.imageDataURL;
      }
      setSelectedPlayers((prev) =>
        prev.map((pl) =>
          (pl.wyId ?? pl.id) === playerId
            ? {
                ...pl,
                imageDataURL: imageDataURL ?? pl.imageDataURL,
                teamImageDataURL: teamImageDataURL ?? pl.teamImageDataURL,
                currentTeam: currentTeam ? { ...pl.currentTeam, ...currentTeam } : pl.currentTeam,
              }
            : pl
        )
      );
    } catch {
      // ignore: keep player without images
    }
  }

  function addPlayer(p: Player) {
    const id = p.wyId ?? p.id;
    if (id == null) return;
    if (selectedPlayers.some((x) => (x.wyId ?? x.id) === id)) return;
    setSelectedPlayers((prev) => [...prev, p]);
    setQuery("");
    setPlayers([]);
    setDropdownOpen(false);
    setFixtures([]);
    setFixturesError(null);
    enrichPlayerWithImages(Number(id));
  }

  function removePlayer(p: Player) {
    const id = p.wyId ?? p.id;
    if (id == null) return;
    setSelectedPlayers((prev) => prev.filter((x) => (x.wyId ?? x.id) !== id));
    setFixtures([]);
    setFixturesError(null);
  }

  async function loadFixtures() {
    if (selectedPlayerIds.length === 0) return;
    setFixturesError(null);
    setFixturesLoading(true);
    const from = dateFrom || defaultDateFrom();
    const to = dateTo ? `&to=${encodeURIComponent(dateTo)}` : "";
    try {
      const results = await Promise.all(
        selectedPlayerIds.map((playerId) =>
          fetch(
            `/api/wyscout/players/${playerId}/fixtures?from=${encodeURIComponent(from)}${to}`
          ).then((res) => res.json())
        )
      );
      const byMatchId = new Map<number, Fixture & { playerNames: string[]; playersInMatch: Player[] }>();
      const nameOf = (p: Player) =>
        [p.firstName, p.lastName].filter(Boolean).join(" ") || "—";
      for (let i = 0; i < results.length; i++) {
        const data = results[i];
        if (data?.error) throw new Error(data.error);
        const list = Array.isArray(data) ? data : data.fixtures ?? data.matches ?? [];
        const player = selectedPlayers[i];
        const playerName = nameOf(player);
        for (const f of list) {
          const mid = f.matchId ?? f.wyId;
          if (mid == null) continue;
          const existing = byMatchId.get(mid);
          if (existing) {
            if (!existing.playerNames!.includes(playerName)) {
              existing.playerNames!.push(playerName);
              existing.playersInMatch!.push(player);
            }
          } else {
            byMatchId.set(mid, { ...f, playerNames: [playerName], playersInMatch: [player] });
          }
        }
      }
      const merged = Array.from(byMatchId.values()).sort((a, b) => {
        const da = new Date(a.date ?? a.dateutc ?? 0).getTime();
        const db = new Date(b.date ?? b.dateutc ?? 0).getTime();
        return da - db;
      });
      setFixtures(merged);
      if (merged.length === 0)
        setFixturesError("Nessuna partita trovata nel periodo selezionato.");
    } catch (err) {
      setFixturesError(
        err instanceof Error ? err.message : "Errore nel caricamento partite"
      );
    } finally {
      setFixturesLoading(false);
    }
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="dm-card p-6">
          <h1 className="text-3xl font-bold text-dm-text">Post match</h1>
          <p className="text-dm-text-muted mt-2">
            Cerca uno o più giocatori per nome, imposta il periodo (da / a) e visualizza le partite nel range di date.
          </p>

          <div className="mt-6 relative max-w-xl" ref={dropdownRef}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => players.length > 0 && setDropdownOpen(true)}
              placeholder="Cerca giocatore (min. 2 caratteri)"
              className="dm-input w-full rounded-md px-3 py-2"
              autoComplete="off"
            />
            {searchLoading && (
              <span className="absolute right-3 top-2.5 text-xs text-dm-text-subtle">
                Ricerca...
              </span>
            )}
            {searchError && (
              <p className="mt-1 text-sm text-dm-error">{searchError}</p>
            )}
            {dropdownOpen && players.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-dm-border bg-dm-card py-1 shadow-lg">
                {players.map((p) => {
                  const id = p.wyId ?? p.id;
                  const name =
                    [p.firstName, p.lastName].filter(Boolean).join(" ") || "—";
                  const team = p.currentTeam?.name;
                  const isAlreadySelected =
                    selectedPlayers.some((x) => (x.wyId ?? x.id) === id);
                  return (
                    <li key={id ?? name}>
                      <button
                        type="button"
                        onClick={() => addPlayer(p)}
                        disabled={isAlreadySelected}
                        className={`block w-full text-left px-4 py-2 hover:bg-dm-elevated disabled:opacity-70 disabled:cursor-default ${
                          isAlreadySelected ? "bg-dm-accent-muted font-medium" : ""
                        }`}
                      >
                        <span className="text-dm-text">{name}</span>
                        {team && (
                          <span className="ml-2 text-sm text-dm-text-subtle">
                            – {team}
                          </span>
                        )}
                        {isAlreadySelected && (
                          <span className="ml-2 text-xs text-dm-accent">
                            (già aggiunto)
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selectedPlayers.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-dm-text-muted w-full">Giocatori selezionati:</span>
              {selectedPlayers.map((p) => {
                const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || "—";
                const team = p.currentTeam?.name;
                return (
                  <span
                    key={p.wyId ?? p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-dm-accent-muted px-3 py-1 text-sm font-medium text-dm-accent"
                  >
                    {name}
                    {team && <span className="text-dm-accent">({team})</span>}
                    <button
                      type="button"
                      onClick={() => removePlayer(p)}
                      className="ml-1 rounded-full p-0.5 hover:opacity-80 text-dm-accent"
                      aria-label={`Rimuovi ${name}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {selectedPlayers.length > 0 && (
            <div className="mt-8">
              <div className="flex flex-wrap items-end gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-dm-text-muted mb-1">
                    Da
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-md border border-dm-border px-3 py-2 shadow-sm focus:border-dm-accent focus:outline-none focus:ring-1 focus:ring-dm-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dm-text mb-1">
                    A
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-md border border-dm-border px-3 py-2 shadow-sm focus:border-dm-accent focus:outline-none focus:ring-1 focus:ring-dm-accent"
                  />
                </div>
              </div>
              <h2 className="text-lg font-semibold text-dm-text">
                Partite nel periodo
              </h2>
              <button
                type="button"
                onClick={loadFixtures}
                disabled={fixturesLoading}
                className="mt-2 rounded-md bg-dm-accent px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {fixturesLoading ? "Caricamento..." : "Cerca partite"}
              </button>

              {fixturesError && (
                <p className="mt-2 text-sm text-dm-error">{fixturesError}</p>
              )}

              {fixtures.length > 0 && (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <div className="flex rounded-md border border-dm-border bg-dm-card p-0.5 shadow-sm">
                      <button
                        type="button"
                        onClick={() => setViewMode("table")}
                        className={`rounded px-3 py-1.5 text-sm font-medium ${
                          viewMode === "table"
                            ? "bg-dm-accent text-white"
                            : "text-dm-text hover:bg-dm-surface"
                        }`}
                      >
                        Tabella
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("calendar")}
                        className={`rounded px-3 py-1.5 text-sm font-medium ${
                          viewMode === "calendar"
                            ? "bg-dm-accent text-white"
                            : "text-dm-text hover:bg-dm-surface"
                        }`}
                      >
                        Calendario
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("gantt")}
                        className={`rounded px-3 py-1.5 text-sm font-medium ${
                          viewMode === "gantt"
                            ? "bg-dm-accent text-white"
                            : "text-dm-text hover:bg-dm-surface"
                        }`}
                      >
                        Gantt
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const csv = fixturesToCsv(fixtures, fixtureAssignments, assignableUsers, deliveryDateOverrides);
                        const base = "partite-post-match";
                        const date = new Date().toISOString().slice(0, 10);
                        downloadCsv(csv, `${base}-${date}.csv`);
                      }}
                      className="rounded-md border border-dm-border bg-dm-card px-4 py-2 text-sm font-medium text-dm-text shadow-sm hover:bg-dm-surface"
                    >
                      Esporta CSV
                    </button>
                  </div>

                  {viewMode === "calendar" && (() => {
                    const byDay = groupFixturesByDay(fixtures);
                    const monthsData = buildCalendarByMonth(byDay);
                    if (monthsData.length === 0) {
                      return (
                        <div className="mt-6 text-sm text-dm-text-subtle">
                          Nessuna partita da mostrare nel calendario.
                        </div>
                      );
                    }
                    const currentMonth =
                      monthsData.find((m) => m.monthKey === calendarMonthKey) ?? monthsData[0];
                    const currentIndex = monthsData.indexOf(currentMonth);
                    const canPrev = currentIndex > 0;
                    const canNext = currentIndex < monthsData.length - 1;

                    async function handleExportCalendarImage() {
                      const node = calendarExportRef.current;
                      if (!node) return;
                      setCalendarExporting(true);
                      try {
                        const { toPng } = await import("html-to-image");
                        const dataUrl = await toPng(node, {
                          pixelRatio: 2,
                          backgroundColor: "#ffffff",
                          cacheBust: true,
                        });
                        const a = document.createElement("a");
                        a.href = dataUrl;
                        a.download = `calendario-${currentMonth.monthKey}.png`;
                        a.click();
                      } catch (err) {
                        console.error("Export calendar image failed:", err);
                      } finally {
                        setCalendarExporting(false);
                      }
                    }

                    return (
                      <div className="mt-6">
                        <div className="flex items-center gap-2 mb-4">
                          <button
                            type="button"
                            onClick={handleExportCalendarImage}
                            disabled={calendarExporting}
                            className="rounded-md border border-dm-border bg-dm-card px-3 py-2 text-sm font-medium text-dm-text shadow-sm hover:bg-dm-surface disabled:opacity-50"
                          >
                            {calendarExporting ? "Esportazione..." : "Esporta come immagine"}
                          </button>
                        </div>
                        <div ref={calendarExportRef} className="bg-dm-card rounded-lg border border-dm-border p-4">
                          <div className="flex items-center justify-between gap-4 mb-4">
                            <button
                              type="button"
                              onClick={() => setCalendarMonthKey(monthsData[currentIndex - 1].monthKey)}
                              disabled={!canPrev}
                              className="rounded-md border border-dm-border bg-dm-card px-3 py-2 text-sm font-medium text-dm-text shadow-sm hover:bg-dm-surface disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label="Mese precedente"
                            >
                              ← Precedente
                            </button>
                            <h3 className="text-lg font-semibold text-dm-text capitalize">
                              {currentMonth.monthLabel}
                            </h3>
                            <button
                              type="button"
                              onClick={() => setCalendarMonthKey(monthsData[currentIndex + 1].monthKey)}
                              disabled={!canNext}
                              className="rounded-md border border-dm-border bg-dm-card px-3 py-2 text-sm font-medium text-dm-text shadow-sm hover:bg-dm-surface disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label="Mese successivo"
                            >
                              Successivo →
                            </button>
                          </div>
                          <section className="w-full">
                          <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
                                <thead>
                                  <tr>
                                    {WEEKDAY_LABELS.map((w) => (
                                      <th
                                        key={w}
                                        className="border border-dm-border bg-dm-surface px-1.5 py-1.5 text-center text-xs font-medium uppercase text-dm-text-subtle"
                                      >
                                        {w}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {currentMonth.weeks.map((row, rowIdx) => (
                                    <tr key={rowIdx}>
                                      {row.map(({ dayKey, dayNum, month, year }) => {
                                        const dayFixtures = byDay.get(dayKey) ?? [];
                                        const isThisMonth = `${year}-${String(month + 1).padStart(2, "0")}` === currentMonth.monthKey;
                                        return (
                                          <td
                                            key={dayKey}
                                            className={`align-top border border-dm-border p-1 min-h-[120px] ${isThisMonth ? "bg-dm-card" : "bg-dm-surface/80"}`}
                                          >
                                            <div className="flex items-center justify-between gap-0.5 mb-1">
                                              <span
                                                className={`text-xs font-medium ${
                                                  dayFixtures.length > 0
                                                    ? "text-dm-accent"
                                                    : isThisMonth
                                                      ? "text-dm-text"
                                                      : "text-dm-text-subtle"
                                                }`}
                                              >
                                                {dayNum}
                                              </span>
                                            </div>
                                            <div className="space-y-1.5">
                                              {dayFixtures.map((f, i) => {
                                                const dateStr = f.date ?? f.dateutc ?? "";
                                                const labelRaw =
                                                  f.label ??
                                                  (f.homeTeam?.name && f.awayTeam?.name
                                                    ? `${f.homeTeam.name} – ${f.awayTeam.name}`
                                                    : f.homeTeamId && f.awayTeamId
                                                      ? `Team ${f.homeTeamId} – Team ${f.awayTeamId}`
                                                      : "");
                                                const label = stripScoreFromLabel(String(labelRaw ?? ""));
                                                const comp = f.competitionName ?? f.competition?.name ?? "";
                                                const gameweek = f.gameweek != null ? String(f.gameweek) : "—";
                                                const compGw = comp ? `${comp} GW${gameweek}` : gameweek !== "—" ? `GW${gameweek}` : "—";
                                                const startShort = dateStr
                                                  ? new Date(dateStr).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
                                                  : "—";
                                                const endShort = f.gameweekEndDate
                                                  ? new Date(f.gameweekEndDate).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
                                                  : "—";
                                                const dateRange = endShort !== "—" ? `${startShort} - ${endShort}` : startShort;
                                                return (
                                                  <div
                                                    key={f.matchId ?? f.wyId ?? i}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => {
                                                      setCalendarPopupFixture(f);
                                                      setExpandedMatchId((f.matchId ?? f.wyId) ?? null);
                                                    }}
                                                    onKeyDown={(e) => {
                                                      if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        setCalendarPopupFixture(f);
                                                        setExpandedMatchId((f.matchId ?? f.wyId) ?? null);
                                                      }
                                                    }}
                                                    className="rounded border border-dm-border bg-dm-card p-1.5 shadow-sm hover:border-dm-border hover:ring-2 hover:ring-dm-accent/50 cursor-pointer text-left"
                                                  >
                                                    <div className="flex items-start gap-1.5">
                                                      <div className="flex shrink-0 -space-x-1.5">
                                                        {(f.playersInMatch ?? []).map((p) => {
                                                          const pl = selectedPlayers.find((s) => (s.wyId ?? s.id) === (p.wyId ?? p.id)) ?? p;
                                                          const pImg = playerImageUrl(pl);
                                                          return (
                                                            <span
                                                              key={pl.wyId ?? pl.id}
                                                              className="inline-block w-6 h-6 rounded-full border border-white bg-dm-elevated overflow-hidden ring-1 ring-dm-border"
                                                              title={[pl.firstName, pl.lastName].filter(Boolean).join(" ")}
                                                            >
                                                              {pImg ? (
                                                                <img
                                                                  src={pImg}
                                                                  alt=""
                                                                  className="w-full h-full object-cover"
                                                                  onError={(e) => {
                                                                    e.currentTarget.style.display = "none";
                                                                  }}
                                                                />
                                                              ) : (
                                                                <span className="w-full h-full flex items-center justify-center text-[9px] font-medium text-dm-text-muted">
                                                                  {[pl.firstName, pl.lastName].filter(Boolean).join(" ").slice(0, 2).toUpperCase()}
                                                                </span>
                                                              )}
                                                            </span>
                                                          );
                                                        })}
                                                      </div>
                                                      <div className="min-w-0 flex-1">
                                                        <p className="font-medium text-dm-text text-[11px] leading-tight line-clamp-2">{label}</p>
                                                        <p className="mt-0.5 text-[9px] text-dm-text-muted truncate">{compGw}</p>
                                                        <p className="text-[9px] text-dm-text-subtle">{dateRange}</p>
                                                      </div>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                          </section>
                        </div>
                      </div>
                    );
                  })()}

                  {viewMode === "gantt" && (() => {
                    const ganttTasks = buildGanttTasks(fixtures, fixtureAssignments, assignableUsers, deliveryDateOverrides);
                    if (ganttTasks.length === 0) {
                      return (
                        <div className="mt-6 text-sm text-dm-text-subtle">
                          Nessuna assegnazione da mostrare. Assegna report o video alle partite nella tabella.
                        </div>
                      );
                    }
                    const byUser = new Map<string, GanttTask[]>();
                    for (const t of ganttTasks) {
                      const list = byUser.get(t.userId) ?? [];
                      list.push(t);
                      byUser.set(t.userId, list);
                    }
                    const sortedUserEntries = Array.from(byUser.entries()).sort(([, tasksA], [, tasksB]) =>
                      (tasksA[0].userName || "").localeCompare(tasksB[0].userName || "", "it", { sensitivity: "base" })
                    );
                    const minTs = Math.min(...ganttTasks.map((t) => t.start.getTime()));
                    const maxTs = Math.max(...ganttTasks.map((t) => t.end.getTime()));
                    const rangeMs = maxTs - minTs || 1;
                    const dayMs = 24 * 60 * 60 * 1000;
                    const totalDays = Math.ceil(rangeMs / dayMs) || 1;
                    const chartWidth = Math.max(600, Math.min(1400, totalDays * 24));
                    const leftLabelWidth = 180;

                    return (
                      <div className="mt-6">
                        <p className="text-sm text-dm-text-muted mb-3">
                          Inizio = data partita · Fine = data di consegna
                        </p>
                        <div className="overflow-x-auto rounded-lg border border-dm-border bg-dm-card">
                          <div style={{ width: leftLabelWidth + chartWidth, minWidth: "100%" }} className="flex">
                            <div className="shrink-0 flex flex-col border-r border-dm-border bg-dm-surface/80" style={{ width: leftLabelWidth }}>
                              <div className="h-7 flex items-center px-3 border-b border-dm-border text-xs font-semibold uppercase text-dm-text-subtle shrink-0">Utente</div>
                              {sortedUserEntries.map(([userId, tasks]) => (
                                <div
                                  key={userId}
                                  className="px-3 flex items-center shrink-0 text-sm font-medium text-dm-text border-b border-dm-border last:border-0"
                                  style={{ height: 56 }}
                                >
                                  {tasks[0].userName || userId}
                                </div>
                              ))}
                            </div>
                            <div className="flex-1 relative py-0 pr-2 flex flex-col" style={{ width: chartWidth }}>
                              <div className="flex flex-col flex-1 min-h-0">
                                <div className="flex text-xs text-dm-text-subtle border-b border-dm-border px-1 shrink-0 h-7 items-center">
                                  {(() => {
                                    const start = new Date(minTs);
                                    const daysToShow = Math.min(31, totalDays);
                                    const step = Math.max(1, Math.floor(daysToShow / 12));
                                    const labels: { left: number; label: string }[] = [];
                                    for (let d = 0; d <= totalDays; d += step) {
                                      const t = minTs + d * dayMs;
                                      const date = new Date(t);
                                      labels.push({
                                        left: (d / totalDays) * 100,
                                        label: date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
                                      });
                                    }
                                    return labels.map(({ left, label }) => (
                                      <span key={label} className="absolute text-[10px]" style={{ left: `${left}%` }}>
                                        {label}
                                      </span>
                                    ));
                                  })()}
                                </div>
                                {sortedUserEntries.map(([userId, userTasks], rowIdx) => {
                                  const isDropTarget = ganttDropTargetUserId === userId;
                                  return (
                                  <div
                                    key={userId}
                                    className={`flex items-center border-b border-dm-border last:border-0 relative shrink-0 transition-colors ${isDropTarget ? "bg-dm-accent-muted" : ""}`}
                                    style={{ height: 56, width: "100%" }}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.dataTransfer.dropEffect = "move";
                                      setGanttDropTargetUserId(userId);
                                    }}
                                    onDragLeave={() => setGanttDropTargetUserId(null)}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      setGanttDropTargetUserId(null);
                                      const raw = e.dataTransfer.getData("application/x-gantt-assignment");
                                      if (!raw) return;
                                      try {
                                        const { assignmentKey, type, userId: draggedUserId } = JSON.parse(raw) as { assignmentKey: string; type: "report" | "video"; userId?: string };
                                        if (draggedUserId === userId) return;
                                        if (type === "report") setReportUser(assignmentKey, userId);
                                        else setVideoUser(assignmentKey, userId);
                                      } catch (_) {}
                                    }}
                                  >
                                    <div className="absolute inset-0 flex items-center" style={{ width: "100%" }}>
                                      {userTasks.map((task, i) => {
                                        const leftPct = ((task.start.getTime() - minTs) / rangeMs) * 100;
                                        const widthPct = ((task.end.getTime() - task.start.getTime()) / rangeMs) * 100;
                                        const isVideo = task.type === "video";
                                        const gapPx = 4;
                                        const tooltipText = `${task.label} · ${task.start.toLocaleDateString("it-IT")} – ${task.end.toLocaleDateString("it-IT")} (${isVideo ? "Video" : "Report"})`;
                                        const barKey = `${userId}-${task.matchId}-${task.type}-${i}`;
                                        const isHovered = hoveredGanttBar === barKey;
                                        return (
                                          <div
                                            key={`${task.matchId}-${task.type}-${i}`}
                                            draggable
                                            onDragStart={(e) => {
                                              e.dataTransfer.setData("application/x-gantt-assignment", JSON.stringify({ assignmentKey: task.assignmentKey, type: task.type, userId: task.userId }));
                                              e.dataTransfer.effectAllowed = "move";
                                              e.dataTransfer.setData("text/plain", task.label);
                                            }}
                                            className={`absolute top-1 bottom-1 rounded-md overflow-hidden flex items-center min-w-[4px] border transition-all duration-150 cursor-grab active:cursor-grabbing ${isHovered ? "z-20 shadow-lg ring-2 ring-dm-accent ring-offset-1 border-white scale-[1.02]" : "z-0 shadow-sm border-white/20"}`}
                                            style={{
                                              left: `calc(${leftPct}% + ${gapPx / 2}px)`,
                                              width: `calc(${Math.max(widthPct, 2)}% - ${gapPx}px)`,
                                              backgroundColor: isVideo ? "#ea580c" : "#2563eb",
                                            }}
                                            title={tooltipText}
                                            onMouseEnter={(e) => {
                                              setHoveredGanttBar(barKey);
                                              if (ganttTooltipTimeoutRef.current) clearTimeout(ganttTooltipTimeoutRef.current);
                                              ganttTooltipTimeoutRef.current = setTimeout(() => {
                                                setGanttTooltip({
                                                  text: tooltipText,
                                                  x: e.clientX,
                                                  y: e.clientY,
                                                });
                                              }, 120);
                                            }}
                                            onMouseMove={(e) => {
                                              setGanttTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                                            }}
                                            onMouseLeave={() => {
                                              setHoveredGanttBar(null);
                                              if (ganttTooltipTimeoutRef.current) {
                                                clearTimeout(ganttTooltipTimeoutRef.current);
                                                ganttTooltipTimeoutRef.current = null;
                                              }
                                              setGanttTooltip(null);
                                            }}
                                            onDragEnd={() => setGanttDropTargetUserId(null)}
                                          >
                                            <span className="text-white text-[10px] font-medium px-1.5 truncate block">
                                              {task.label.length > 20 ? task.label.slice(0, 18) + "…" : task.label}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex gap-4 text-xs text-dm-text-subtle">
                          <span className="flex items-center gap-1 text-dm-text"><span className="w-3 h-3 rounded bg-dm-accent" /> Report</span>
                          <span className="flex items-center gap-1 text-dm-text"><span className="w-3 h-3 rounded bg-orange-600" /> Video</span>
                        </div>
                        {ganttTooltip && (
                          <div
                            className="fixed z-50 pointer-events-none px-2 py-1.5 text-xs font-medium text-white bg-dm-elevated rounded shadow-lg whitespace-nowrap"
                            style={{ left: ganttTooltip.x + 10, top: ganttTooltip.y + 8 }}
                          >
                            {ganttTooltip.text}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {viewMode === "table" && (
                  <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="w-10 px-3 py-3 text-left" aria-label="Espandi" />
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-dm-text-subtle w-20">
                          Foto
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase text-dm-text-subtle">
                          Giocatore
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase text-dm-text-subtle">
                          Data / Label
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase text-dm-text-subtle">
                          Area / Competizione / Stagione / Round
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase text-dm-text-subtle">
                          Gameweek
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase text-dm-text-subtle whitespace-nowrap">
                          Gameweek inizio – fine
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase text-dm-text-subtle whitespace-nowrap">
                          Data di consegna
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase text-dm-text-subtle min-w-[280px]">
                          Assegnazioni (report / video per giocatore)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {fixtures.map((f, i) => {
                        const rowKey = getFixtureRowKey(f, i);
                        const isExpanded = expandedMatchId === (f.matchId ?? f.wyId);
                        const dateStr = f.date ?? f.dateutc ?? "";
                        const dateFormatted = dateStr
                          ? new Date(dateStr).toLocaleDateString("it-IT")
                          : "—";
                        const labelRaw =
                          f.label ??
                          (f.homeTeam?.name && f.awayTeam?.name
                            ? `${f.homeTeam.name} – ${f.awayTeam.name}`
                            : f.homeTeamId && f.awayTeamId
                              ? `Team ${f.homeTeamId} – Team ${f.awayTeamId}`
                              : "—");
                        const label = stripScoreFromLabel(String(labelRaw ?? ""));
                        const area = f.areaName ?? f.competition?.area?.name;
                        const comp = f.competitionName ?? f.competition?.name;
                        const season = f.seasonName ?? f.season?.name;
                        const roundLabel =
                          f.roundName ??
                          (typeof f.round === "object" && f.round?.name
                            ? f.round.name
                            : typeof f.round === "number"
                              ? String(f.round)
                              : f.round ?? "");
                        const parts = [area, comp, season, roundLabel].filter(
                          Boolean
                        );
                        const gameweek =
                          f.gameweek != null ? String(f.gameweek) : "—";
                        const gwStart = f.gameweekStartDate
                          ? new Date(f.gameweekStartDate).toLocaleDateString("it-IT")
                          : "";
                        const gwEnd = f.gameweekEndDate
                          ? new Date(f.gameweekEndDate).toLocaleDateString("it-IT")
                          : "";
                                        const gameweekRange =
                                          gwStart && gwEnd ? `${gwStart} – ${gwEnd}` : "—";
                                        const gameweekMatchesList = [...(f.gameweekMatches ?? [])].sort(
                                          (a, b) =>
                                            new Date(a.dateutc ?? a.date ?? 0).getTime() -
                                            new Date(b.dateutc ?? b.date ?? 0).getTime()
                                        );
                                        const playerMatchTime = new Date(
                                          (f.dateutc ?? f.date) ?? 0
                                        ).getTime();
                        return (
                          <Fragment key={rowKey}>
                            <tr>
                              <td className="w-10 px-3 py-3 align-middle">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedMatchId((prev) =>
                                      prev === (f.matchId ?? f.wyId)
                                        ? null
                                        : (f.matchId ?? f.wyId) ?? null
                                    )
                                  }
                                  className="text-dm-text-subtle hover:text-dm-text"
                                  aria-expanded={isExpanded}
                                >
                                  <span className="inline-block transition-transform">
                                    {isExpanded ? "▼" : "▶"}
                                  </span>
                                </button>
                              </td>
                              <td className="px-4 py-3 align-middle">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {(f.playersInMatch ?? []).map((p) => {
                                    const pl = selectedPlayers.find((s) => (s.wyId ?? s.id) === (p.wyId ?? p.id)) ?? p;
                                    const pImg = playerImageUrl(pl);
                                    const tImg = teamImageUrl(pl);
                                    return (
                                      <div key={pl.wyId ?? pl.id} className="flex items-center gap-0.5">
                                        {pImg ? (
                                          <img src={pImg} alt="" className="w-8 h-8 rounded-full object-cover bg-dm-elevated" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                        ) : (
                                          <span className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-dm-text-muted">
                                            {[pl.firstName, pl.lastName].filter(Boolean).join(" ").slice(0, 2).toUpperCase()}
                                          </span>
                                        )}
                                        {tImg ? (
                                          <span className="inline-flex w-6 h-6 shrink-0 items-center justify-center overflow-hidden rounded bg-dm-elevated">
                                            <img src={tImg} alt="" className="max-h-6 max-w-6 w-auto h-auto object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                          </span>
                                        ) : (
                                          <span className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center text-[10px]" title={(pl.currentTeam as { name?: string })?.name ?? ""}>?</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="px-5 py-3 text-sm text-dm-text align-middle">
                                {(f.playerNames ?? []).join(", ")}
                              </td>
                              <td className="px-5 py-3 text-sm align-middle">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-dm-text text-xs whitespace-nowrap">{dateFormatted}</span>
                                  <span className="text-dm-text font-medium">{label}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-sm text-dm-text align-middle">
                                {parts.length > 0 ? parts.join(" / ") : "—"}
                              </td>
                              <td className="px-5 py-3 text-sm text-dm-text whitespace-nowrap align-middle">
                                {gameweek}
                              </td>
                              <td className="px-5 py-3 text-sm text-dm-text whitespace-nowrap align-middle">
                                {gameweekRange}
                              </td>
                              <td className="px-5 py-3 align-middle">
                                {(() => {
                                  const effective = getEffectiveDeliveryDate(rowKey, f, deliveryDateOverrides);
                                  return (
                                    <input
                                      type="date"
                                      value={effective || ""}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setDeliveryDateOverrides((prev) =>
                                          v ? { ...prev, [rowKey]: v } : (() => { const { [rowKey]: _, ...rest } = prev; return rest; })()
                                        );
                                      }}
                                      className="block w-full min-w-[120px] rounded border border-dm-border px-2 py-1 text-sm text-dm-text focus:border-dm-accent focus:outline-none focus:ring-1 focus:ring-dm-accent"
                                    />
                                  );
                                })()}
                              </td>
                              <td className="px-5 py-3 align-top">
                                <div className="flex flex-col gap-2">
                                  {(f.playersInMatch ?? []).map((p) => {
                                    const pl = selectedPlayers.find((s) => (s.wyId ?? s.id) === (p.wyId ?? p.id)) ?? p;
                                    const pid = pl.wyId ?? pl.id;
                                    if (pid == null) return null;
                                    const key = assignmentKey(rowKey, pid);
                                    const assign = getAssignment(key);
                                    const pImg = playerImageUrl(pl);
                                    const playerLabel = (pl.shortName ?? ([pl.firstName, pl.lastName].filter(Boolean).join(" ") || `#${pid}`)) as string;
                                    const hasReport = !!assign.reportUserId;
                                    const videoValue = assign.videoUserId ?? "";
                                    return (
                                      <div
                                        key={pid}
                                        className="flex flex-col gap-2 rounded-lg border border-dm-border bg-dm-surface/80 p-2 shadow-sm"
                                      >
                                        <div className="flex min-w-0 shrink-0 items-center justify-center gap-1.5">
                                          {pImg ? (
                                            <img
                                              src={pImg}
                                              alt=""
                                              className="h-7 w-7 rounded-full object-cover ring-1 ring-dm-border"
                                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                                            />
                                          ) : (
                                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-[10px] font-medium text-dm-text-muted">
                                              {playerLabel.slice(0, 2).toUpperCase()}
                                            </span>
                                          )}
                                          <span className="max-w-[80px] truncate text-xs font-medium text-dm-text" title={playerLabel}>
                                            {playerLabel}
                                          </span>
                                        </div>
                                        <div className="flex flex-1 flex-wrap items-end gap-2">
                                          <div className="min-w-[120px] flex-1">
                                            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-dm-text-subtle">
                                              Report
                                            </label>
                                            <select
                                              value={assign.reportUserId}
                                              onChange={(e) => setReportUser(key, e.target.value)}
                                              className={selectBaseClass}
                                            >
                                              <option value="">—</option>
                                              {assignableUsers.map((u) => (
                                                <option key={u.id} value={u.id}>
                                                  {u.full_name ?? u.email ?? u.id}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                          <div className="min-w-[100px] flex-1">
                                            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-dm-text-subtle">
                                              Video
                                            </label>
                                            <select
                                              value={videoValue}
                                              onChange={(e) => setVideoUser(key, e.target.value || null)}
                                              disabled={!hasReport}
                                              className={`${selectBaseClass} ${!hasReport ? "cursor-not-allowed bg-dm-elevated text-dm-text-subtle" : ""}`}
                                              title={!hasReport ? "Seleziona prima Report" : undefined}
                                            >
                                              <option value="">—</option>
                                              {assignableUsers.map((u) => (
                                                <option key={u.id} value={u.id}>
                                                  {u.full_name ?? u.email ?? u.id}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${rowKey}-detail`} className="bg-dm-surface">
                                <td colSpan={9} className="px-4 py-4">
                                  <div className="text-sm text-black">
                                    <p className="mb-2 font-medium">
                                      Match del turno (
                                      {gameweekMatchesList.length})
                                    </p>
                                    <div className="overflow-hidden rounded-lg border border-dm-border bg-dm-card">
                                      {gameweekMatchesList.length === 0 ? (
                                        <p className="px-4 py-3 text-dm-text-subtle">
                                          Nessun match
                                        </p>
                                      ) : (
                                        <table className="min-w-full text-left">
                                          <thead>
                                            <tr className="border-b border-dm-border bg-dm-surface">
                                              <th className="px-4 py-2 font-medium text-dm-text">
                                                Partita
                                              </th>
                                              <th className="px-4 py-2 font-medium text-dm-text whitespace-nowrap">
                                                Data
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {gameweekMatchesList.map((m, mi) => {
                                              const mDate =
                                                m.dateutc ?? m.date ?? "";
                                              const mDateFmt = mDate
                                                ? new Date(mDate).toLocaleDateString(
                                                    "it-IT"
                                                  )
                                                : "—";
                                              const mTime = new Date(
                                                mDate || 0
                                              ).getTime();
                                              const diffDays = Number.isNaN(mTime)
                                                ? 0
                                                : Math.floor(
                                                    (mTime - playerMatchTime) /
                                                      (1000 * 60 * 60 * 24)
                                                  );
                                              const bgClass =
                                                diffDays <= 0
                                                  ? "bg-green-100"
                                                  : diffDays <= 2
                                                    ? "bg-yellow-100"
                                                    : "bg-red-100";
                                              return (
                                                <tr
                                                  key={m.matchId ?? mi}
                                                  className={`border-b border-dm-border last:border-0 ${bgClass}`}
                                                >
                                                  <td className="px-4 py-2">
                                                    {stripScoreFromLabel(String(m.label ?? "")) || "—"}
                                                  </td>
                                                  <td className="px-4 py-2 whitespace-nowrap">
                                                    {mDateFmt}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {calendarPopupFixture && (() => {
        const f = calendarPopupFixture;
        const gameweekMatchesList = [...(f.gameweekMatches ?? [])].sort(
          (a, b) =>
            new Date(a.dateutc ?? a.date ?? 0).getTime() -
            new Date(b.dateutc ?? b.date ?? 0).getTime()
        );
        const playerMatchTime = new Date((f.dateutc ?? f.date) ?? 0).getTime();
        const label = stripScoreFromLabel(
          String(
            f.label ??
              (f.homeTeam?.name && f.awayTeam?.name
                ? `${f.homeTeam.name} – ${f.awayTeam.name}`
                : f.homeTeamId && f.awayTeamId
                  ? `Team ${f.homeTeamId} – Team ${f.awayTeamId}`
                  : "—")
          )
        );
        const comp = f.competitionName ?? f.competition?.name ?? "";
        const gameweek = f.gameweek != null ? String(f.gameweek) : "—";
        const compGw = comp ? `${comp} GW${gameweek}` : gameweek !== "—" ? `GW${gameweek}` : "—";
        const dateStr = f.date ?? f.dateutc ?? "";
        const startShort = dateStr
          ? new Date(dateStr).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
          : "—";
        const endShort = f.gameweekEndDate
          ? new Date(f.gameweekEndDate).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
          : "—";
        const dateRange = endShort !== "—" ? `${startShort} - ${endShort}` : startShort;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setCalendarPopupFixture(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-popup-title"
          >
            <div
              className="bg-dm-card rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4 px-4 py-4 border-b border-dm-border shrink-0">
                <div className="flex shrink-0 -space-x-2">
                  {(f.playersInMatch ?? []).map((p) => {
                    const pl = selectedPlayers.find((s) => (s.wyId ?? s.id) === (p.wyId ?? p.id)) ?? p;
                    const pImg = playerImageUrl(pl);
                    return (
                      <span
                        key={pl.wyId ?? pl.id}
                        className="inline-block w-10 h-10 rounded-full border-2 border-white bg-dm-elevated overflow-hidden ring-1 ring-dm-border"
                        title={[pl.firstName, pl.lastName].filter(Boolean).join(" ")}
                      >
                        {pImg ? (
                          <img src={pImg} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center text-xs font-medium text-dm-text-muted">
                            {[pl.firstName, pl.lastName].filter(Boolean).join(" ").slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="calendar-popup-title" className="text-lg font-semibold text-dm-text">
                    {label}
                  </h2>
                  <p className="mt-0.5 text-sm text-dm-text-muted">{compGw}</p>
                  <p className="mt-0.5 text-sm text-dm-text-subtle">{dateRange}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarPopupFixture(null)}
                  className="rounded p-1.5 text-dm-text-subtle hover:bg-dm-elevated hover:text-dm-text shrink-0"
                  aria-label="Chiudi"
                >
                  ×
                </button>
              </div>
              <div className="p-4 overflow-auto text-sm text-black space-y-4">
                <div className="space-y-3 pb-4 border-b border-dm-border">
                  <p className="text-xs font-semibold uppercase tracking-wide text-dm-text-subtle">Assegnazioni (report / video per giocatore)</p>
                  {(f.playersInMatch ?? []).map((p) => {
                    const pl = selectedPlayers.find((s) => (s.wyId ?? s.id) === (p.wyId ?? p.id)) ?? p;
                    const pid = pl.wyId ?? pl.id;
                    if (pid == null) return null;
                    const popupRowKey = String(f.matchId ?? f.wyId);
                    const key = assignmentKey(popupRowKey, pid);
                    const assign = getAssignment(key);
                    const pImg = playerImageUrl(pl);
                    const playerLabel = (pl.shortName ?? ([pl.firstName, pl.lastName].filter(Boolean).join(" ") || `#${pid}`)) as string;
                    const hasReport = !!assign.reportUserId;
                    const videoValue = assign.videoUserId ?? "";
                    return (
                      <div
                        key={pid}
                        className="flex flex-col gap-3 rounded-lg border border-dm-border bg-dm-surface/80 p-3 shadow-sm"
                      >
                        <div className="flex min-w-0 shrink-0 flex-col items-center gap-1">
                          {pImg ? (
                            <img
                              src={pImg}
                              alt=""
                              className="h-12 w-12 rounded-full object-cover ring-1 ring-dm-border"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          ) : (
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-dm-text-muted">
                              {playerLabel.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <span className="max-w-[140px] truncate text-sm font-medium text-dm-text" title={playerLabel}>
                            {playerLabel}
                          </span>
                        </div>
                        <div className="flex flex-1 flex-wrap items-end gap-3">
                          <div className="min-w-[160px] flex-1">
                            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-dm-text-subtle">
                              Report
                            </label>
                            <select
                              value={assign.reportUserId}
                              onChange={(e) => setReportUser(key, e.target.value)}
                              className={selectBaseClass}
                            >
                              <option value="">—</option>
                              {assignableUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.full_name ?? u.email ?? u.id}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="min-w-[160px] flex-1">
                            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-dm-text-subtle">
                              Video
                            </label>
                            <select
                              value={videoValue}
                              onChange={(e) => setVideoUser(key, e.target.value || null)}
                              disabled={!hasReport}
                              className={`${selectBaseClass} ${!hasReport ? "cursor-not-allowed bg-dm-elevated text-dm-text-subtle" : ""}`}
                              title={!hasReport ? "Seleziona prima Report" : undefined}
                            >
                              <option value="">—</option>
                              {assignableUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.full_name ?? u.email ?? u.id}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mb-2 font-medium">Match del turno ({gameweekMatchesList.length})</p>
                <div className="overflow-hidden rounded-lg border border-dm-border bg-dm-card">
                  {gameweekMatchesList.length === 0 ? (
                    <p className="px-4 py-3 text-dm-text-subtle">Nessun match</p>
                  ) : (
                    <table className="min-w-full text-left">
                      <thead>
                        <tr className="border-b border-dm-border bg-dm-surface">
                          <th className="px-4 py-2 font-medium text-dm-text">Partita</th>
                          <th className="px-4 py-2 font-medium text-dm-text whitespace-nowrap">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gameweekMatchesList.map((m, mi) => {
                          const mDate = m.dateutc ?? m.date ?? "";
                          const mDateFmt = mDate ? new Date(mDate).toLocaleDateString("it-IT") : "—";
                          const mTime = new Date(mDate || 0).getTime();
                          const diffDays = Number.isNaN(mTime)
                            ? 0
                            : Math.floor((mTime - playerMatchTime) / (1000 * 60 * 60 * 24));
                          const bgClass =
                            diffDays <= 0 ? "bg-green-100" : diffDays <= 2 ? "bg-yellow-100" : "bg-red-100";
                          return (
                            <tr key={m.matchId ?? mi} className={`border-b border-dm-border last:border-0 ${bgClass}`}>
                              <td className="px-4 py-2">{stripScoreFromLabel(String(m.label ?? "")) || "—"}</td>
                              <td className="px-4 py-2 whitespace-nowrap">{mDateFmt}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
