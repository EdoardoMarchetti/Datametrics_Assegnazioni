"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";

const DEBOUNCE_MS = 300;

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
  seasonId?: string;
  roundId?: string;
  gameweekMatches?: GameweekMatch[];
  roundMatches?: GameweekMatch[];
  seasonMatches?: GameweekMatch[];
  playerNames?: string[];
  playersInMatch?: Player[];
  [key: string]: unknown;
};

/** Remove trailing ", 0-0" (or any score) from match label */
function stripScoreFromLabel(label: string): string {
  return label.replace(/,\s*\d+-\d+\s*$/, "").trim();
}

function escapeCsvCell(val: string): string {
  const s = String(val ?? "").trim();
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fixturesToCsv(fixtures: Fixture[]): string {
  const header = [
    "Giocatore",
    "Data",
    "Label",
    "Area / Competizione / Stagione / Round",
    "Gameweek",
    "Gameweek inizio",
    "Gameweek fine",
    "Match ID",
  ];
  const rows = fixtures.map((f) => {
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
    return [
      (f.playerNames ?? []).join("; "),
      dateFormatted,
      label,
      parts.join(" / "),
      gameweek,
      gwStart,
      gwEnd,
      String(f.matchId ?? f.wyId ?? ""),
    ].map(escapeCsvCell);
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
  const [detailsByKey, setDetailsByKey] = useState<
    Record<string, { playerDetails: unknown; teamDetails: unknown }>
  >({});
  const selectedPlayerIds = selectedPlayers.map((p) => p.wyId ?? p.id).filter((id): id is number => id != null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const detailsFetchedRef = useRef<Set<string>>(new Set());

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setPlayers([]);
      setSearchError(null);
      setSearchLoading(false);
      setDropdownOpen(false);
      return;
    }
    setSearchError(null);
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/wyscout/players/search?q=${encodeURIComponent(q.trim())}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      const list = Array.isArray(data.players) ? data.players : [];
      setPlayers(list);
      setDropdownOpen(true);
      if (list.length === 0) setSearchError("Nessun giocatore trovato.");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Errore di ricerca");
      setPlayers([]);
    } finally {
      setSearchLoading(false);
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
    if (expandedMatchId == null || fixtures.length === 0) return;
    const fixture = fixtures.find(
      (f) => (f.matchId ?? f.wyId) === expandedMatchId
    );
    const playersInMatch = fixture?.playersInMatch ?? [];
    for (const p of playersInMatch) {
      const pid = p.wyId ?? p.id;
      if (pid == null) continue;
      const key = `${expandedMatchId}-${pid}`;
      if (detailsByKey[key] || detailsFetchedRef.current.has(key)) continue;
      detailsFetchedRef.current.add(key);
      (async () => {
        try {
          const playerRes = await fetch(
            `/api/wyscout/players/${pid}?details=currentTeam,playerDetails`
          ).then((r) => r.json());
          const teamWyId = (playerRes as { currentTeam?: { wyId?: number } })
            ?.currentTeam?.wyId;
          let teamDetails: unknown = null;
          if (teamWyId != null) {
            teamDetails = await fetch(
              `/api/wyscout/teams/${teamWyId}?details=teamDetails`
            ).then((r) => r.json());
          }
          setDetailsByKey((prev) => ({
            ...prev,
            [key]: { playerDetails: playerRes, teamDetails },
          }));
        } catch {
          setDetailsByKey((prev) => ({
            ...prev,
            [key]: { playerDetails: null, teamDetails: null },
          }));
        }
      })();
    }
  }, [expandedMatchId, fixtures]);

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
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900">Post match</h1>
          <p className="text-gray-600 mt-2">
            Cerca uno o più giocatori per nome, imposta il periodo (da / a) e visualizza le partite nel range di date.
          </p>

          <div className="mt-6 relative max-w-xl" ref={dropdownRef}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => players.length > 0 && setDropdownOpen(true)}
              placeholder="Cerca giocatore per nome (ricerca in tempo reale)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoComplete="off"
            />
            {searchLoading && (
              <span className="absolute right-3 top-2.5 text-xs text-gray-500">
                Ricerca...
              </span>
            )}
            {searchError && (
              <p className="mt-1 text-sm text-red-600">{searchError}</p>
            )}
            {dropdownOpen && players.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
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
                        className={`block w-full text-left px-4 py-2 hover:bg-gray-100 disabled:opacity-70 disabled:cursor-default ${
                          isAlreadySelected ? "bg-indigo-50 font-medium" : ""
                        }`}
                      >
                        <span className="text-gray-900">{name}</span>
                        {team && (
                          <span className="ml-2 text-sm text-gray-500">
                            – {team}
                          </span>
                        )}
                        {isAlreadySelected && (
                          <span className="ml-2 text-xs text-indigo-600">
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
              <span className="text-sm text-gray-600 w-full">Giocatori selezionati:</span>
              {selectedPlayers.map((p) => {
                const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || "—";
                const team = p.currentTeam?.name;
                return (
                  <span
                    key={p.wyId ?? p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800"
                  >
                    {name}
                    {team && <span className="text-indigo-600">({team})</span>}
                    <button
                      type="button"
                      onClick={() => removePlayer(p)}
                      className="ml-1 rounded-full p-0.5 hover:bg-indigo-200 text-indigo-600"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Da
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    A
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Partite nel periodo
              </h2>
              <button
                type="button"
                onClick={loadFixtures}
                disabled={fixturesLoading}
                className="mt-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {fixturesLoading ? "Caricamento..." : "Cerca partite"}
              </button>

              {fixturesError && (
                <p className="mt-2 text-sm text-red-600">{fixturesError}</p>
              )}

              {fixtures.length > 0 && (
                <>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const csv = fixturesToCsv(fixtures);
                        const base = "partite-post-match";
                        const date = new Date().toISOString().slice(0, 10);
                        downloadCsv(csv, `${base}-${date}.csv`);
                      }}
                      className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                    >
                      Esporta CSV
                    </button>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="w-10 px-2 py-2" aria-label="Espandi" />
                        <th className="px-2 py-2 text-left text-xs font-medium uppercase text-gray-500 w-20">
                          Foto
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                          Giocatore
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                          Data
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                          Label
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                          Area / Competizione / Stagione / Round
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                          Gameweek
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                          Gameweek inizio – fine
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {fixtures.map((f, i) => {
                        const rowKey = f.matchId ?? f.wyId ?? i;
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
                              <td className="w-10 px-2 py-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedMatchId((prev) =>
                                      prev === (f.matchId ?? f.wyId)
                                        ? null
                                        : (f.matchId ?? f.wyId) ?? null
                                    )
                                  }
                                  className="text-gray-500 hover:text-gray-700"
                                  aria-expanded={isExpanded}
                                >
                                  <span className="inline-block transition-transform">
                                    {isExpanded ? "▼" : "▶"}
                                  </span>
                                </button>
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {(f.playersInMatch ?? []).map((p) => {
                                    const pl = selectedPlayers.find((s) => (s.wyId ?? s.id) === (p.wyId ?? p.id)) ?? p;
                                    const pImg = playerImageUrl(pl);
                                    const tImg = teamImageUrl(pl);
                                    return (
                                      <div key={pl.wyId ?? pl.id} className="flex items-center gap-0.5">
                                        {pImg ? (
                                          <img src={pImg} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-100" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                        ) : (
                                          <span className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                                            {[pl.firstName, pl.lastName].filter(Boolean).join(" ").slice(0, 2).toUpperCase()}
                                          </span>
                                        )}
                                        {tImg ? (
                                          <img src={tImg} alt="" className="w-6 h-6 rounded object-cover bg-gray-100" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                        ) : (
                                          <span className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center text-[10px]" title={(pl.currentTeam as { name?: string })?.name ?? ""}>?</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900">
                                {(f.playerNames ?? []).join(", ")}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">
                                {dateFormatted}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900">
                                {label}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-700">
                                {parts.length > 0 ? parts.join(" / ") : "—"}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">
                                {gameweek}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">
                                {gameweekRange}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${rowKey}-detail`} className="bg-gray-50">
                                <td colSpan={8} className="px-4 py-4">
                                  <div className="text-sm text-black">
                                    <p className="mb-2 font-medium">
                                      Match del turno (
                                      {gameweekMatchesList.length})
                                    </p>
                                    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                                      {gameweekMatchesList.length === 0 ? (
                                        <p className="px-4 py-3 text-gray-500">
                                          Nessun match
                                        </p>
                                      ) : (
                                        <table className="min-w-full text-left">
                                          <thead>
                                            <tr className="border-b border-gray-200 bg-gray-50">
                                              <th className="px-4 py-2 font-medium text-gray-700">
                                                Partita
                                              </th>
                                              <th className="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">
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
                                                  className={`border-b border-gray-100 last:border-0 ${bgClass}`}
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
                                    <div className="mt-4">
                                      <p className="mb-2 font-medium text-gray-900">
                                        Dettagli giocatore e squadra
                                      </p>
                                      {(f.playersInMatch ?? []).map((pl) => {
                                        const pid = pl.wyId ?? pl.id;
                                        const key =
                                          pid != null
                                            ? `${f.matchId ?? f.wyId}-${pid}`
                                            : "";
                                        const details = key ? detailsByKey[key] : null;
                                        const name =
                                          [pl.firstName, pl.lastName]
                                            .filter(Boolean)
                                            .join(" ") || "—";
                                        return (
                                          <div
                                            key={pid}
                                            className="mb-4 rounded-lg border border-gray-200 bg-white overflow-hidden"
                                          >
                                            <p className="px-4 py-2 bg-gray-50 font-medium text-gray-800 border-b border-gray-200">
                                              {name}
                                            </p>
                                            {!details ? (
                                              <p className="px-4 py-2 text-sm text-gray-500">
                                                Caricamento...
                                              </p>
                                            ) : (
                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                                                <div>
                                                  <p className="text-xs font-semibold uppercase text-gray-500 mb-1">
                                                    playerDetails
                                                  </p>
                                                  <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-64 border border-gray-100">
                                                    {JSON.stringify(
                                                      details.playerDetails,
                                                      null,
                                                      2
                                                    )}
                                                  </pre>
                                                </div>
                                                <div>
                                                  <p className="text-xs font-semibold uppercase text-gray-500 mb-1">
                                                    teamDetails
                                                  </p>
                                                  <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-64 border border-gray-100">
                                                    {JSON.stringify(
                                                      details.teamDetails,
                                                      null,
                                                      2
                                                    )}
                                                  </pre>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
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
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
