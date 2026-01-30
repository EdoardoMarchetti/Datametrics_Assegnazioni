"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";

const DEBOUNCE_MS = 300;

type Player = {
  wyId?: number;
  id?: number;
  shortName?: string;
  firstName?: string;
  lastName?: string;
  currentTeam?: { name?: string };
  role?: { name?: string };
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
  [key: string]: unknown;
};

export default function PostMatchPage() {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [fixturesLoading, setFixturesLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [fixturesError, setFixturesError] = useState<string | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const playerId = selectedPlayer?.wyId ?? selectedPlayer?.id;

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

  function selectPlayer(p: Player) {
    setSelectedPlayer(p);
    setQuery("");
    setPlayers([]);
    setDropdownOpen(false);
    setFixtures([]);
    setFixturesError(null);
  }

  async function loadFixtures() {
    if (!playerId) return;
    setFixturesError(null);
    setFixturesLoading(true);
    const from = new Date().toISOString().slice(0, 10);
    try {
      const res = await fetch(
        `/api/wyscout/players/${playerId}/fixtures?from=${from}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load fixtures");
      const list = Array.isArray(data) ? data : data.fixtures ?? data.matches ?? [];
      setFixtures(list);
      if (list.length === 0) setFixturesError("Nessuna prossima partita trovata.");
    } catch (err) {
      setFixturesError(
        err instanceof Error ? err.message : "Errore nel caricamento partite"
      );
    } finally {
      setFixturesLoading(false);
    }
  }

  const playerName = selectedPlayer
    ? [selectedPlayer.firstName, selectedPlayer.lastName]
        .filter(Boolean)
        .join(" ") || "Giocatore"
    : "";

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900">Post match</h1>
          <p className="text-gray-600 mt-2">
            Cerca un giocatore per nome e visualizza le sue prossime partite.
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
                  const isSelected =
                    selectedPlayer && (selectedPlayer.wyId ?? selectedPlayer.id) === id;
                  return (
                    <li key={id ?? name}>
                      <button
                        type="button"
                        onClick={() => selectPlayer(p)}
                        className={`block w-full text-left px-4 py-2 hover:bg-gray-100 ${
                          isSelected ? "bg-indigo-50 font-medium" : ""
                        }`}
                      >
                        <span className="text-gray-900">{name}</span>
                        {team && (
                          <span className="ml-2 text-sm text-gray-500">
                            – {team}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selectedPlayer && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm text-gray-600">Giocatore selezionato:</span>
              <span className="font-medium text-gray-900">
                {[selectedPlayer.firstName, selectedPlayer.lastName]
                  .filter(Boolean)
                  .join(" ")}
                {selectedPlayer.currentTeam?.name && (
                  <span className="ml-1 font-normal text-gray-500">
                    ({selectedPlayer.currentTeam.name})
                  </span>
                )}
              </span>
            </div>
          )}

          {selectedPlayer && playerId && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-gray-900">
                Prossime partite – {playerName}
              </h2>
              <button
                type="button"
                onClick={loadFixtures}
                disabled={fixturesLoading}
                className="mt-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {fixturesLoading ? "Caricamento..." : "Vedi prossime partite"}
              </button>

              {fixturesError && (
                <p className="mt-2 text-sm text-red-600">{fixturesError}</p>
              )}

              {fixtures.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="w-10 px-2 py-2" aria-label="Espandi" />
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
                        const label =
                          f.label ??
                          (f.homeTeam?.name && f.awayTeam?.name
                            ? `${f.homeTeam.name} – ${f.awayTeam.name}`
                            : f.homeTeamId && f.awayTeamId
                              ? `Team ${f.homeTeamId} – Team ${f.awayTeamId}`
                              : "—");
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
                                        const gameweekMatchesList = f.gameweekMatches ?? [];
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
                                <td colSpan={6} className="px-4 py-4">
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
                                                    {m.label ?? "—"}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
