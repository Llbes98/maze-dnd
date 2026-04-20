"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cellKey,
  getVisibleCellKeys,
  isWallBetween,
  wallKey,
  type WallDirection,
} from "@/lib/maze-visibility";

const PLAYER_VIEW_SIZE = 10;
const PLAYER_CENTER_OFFSET = Math.floor(PLAYER_VIEW_SIZE / 2);

type Participant = {
  id: string;
  name: string;
  kind: "player" | "npc";
  x: number | null;
  y: number | null;
  turn_order: number | null;
  remaining_moves: number;
  color?: PlayerColor;
  move_points_per_turn?: number;
  has_ended_turn?: boolean;
};

type Trap = {
  id: string;
  x: number;
  y: number;
  label: string;
  visibility_mode: "hidden" | "public" | "selective";
  is_triggered: boolean;
};

type TriggeredTrap = {
  id: string;
  label: string;
};

type Wall = {
  x: number;
  y: number;
  direction: WallDirection;
};

type GameState = {
  game: {
    code: string;
    name: string;
    width: number;
    height: number;
    status: "setup" | "active" | "finished";
    is_npc_turn: boolean;
  };
  walls: Wall[];
  traps: Trap[];
  participants: Participant[];
  activeParticipantId: string | null;
  activeTurnKind: "player" | "npc";
};

type PlayerColor =
  | "red"
  | "dark-green"
  | "light-green"
  | "dark-blue"
  | "light-blue"
  | "purple"
  | "yellow"
  | "orange";

const PLAYER_COLOR_OPTIONS: { value: PlayerColor; label: string; className: string }[] = [
  { value: "red", label: "Red", className: "bg-red-500" },
  { value: "dark-green", label: "Dark green", className: "bg-green-800" },
  { value: "light-green", label: "Light green", className: "bg-lime-300" },
  { value: "dark-blue", label: "Dark blue", className: "bg-blue-800" },
  { value: "light-blue", label: "Light blue", className: "bg-sky-300" },
  { value: "purple", label: "Purple", className: "bg-purple-500" },
  { value: "yellow", label: "Yellow", className: "bg-yellow-300" },
  { value: "orange", label: "Orange", className: "bg-orange-400" },
];

const PARTICIPANT_COLOR_CLASSES: Record<PlayerColor, string> = {
  red: "bg-red-500 border-red-800 text-white",
  "dark-green": "bg-green-800 border-green-950 text-white",
  "light-green": "bg-lime-300 border-lime-700 text-lime-950",
  "dark-blue": "bg-blue-800 border-blue-950 text-white",
  "light-blue": "bg-sky-300 border-sky-700 text-sky-950",
  purple: "bg-purple-500 border-purple-800 text-white",
  yellow: "bg-yellow-300 border-yellow-700 text-yellow-950",
  orange: "bg-orange-400 border-orange-700 text-orange-950",
};

function normalizePlayerColor(color: string | undefined): PlayerColor {
  return PLAYER_COLOR_OPTIONS.some((option) => option.value === color) ? (color as PlayerColor) : "red";
}

function participantCellClass(participant: Participant) {
  return PARTICIPANT_COLOR_CLASSES[normalizePlayerColor(participant.color)];
}

function getStorageKey(gameCode: string) {
  return `maze-player-id:${gameCode}`;
}

export default function PlayerPage({ params }: { params: Promise<{ gameCode: string }> }) {
  const [gameCode, setGameCode] = useState("");
  const [state, setState] = useState<GameState | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<PlayerColor>("red");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pendingTrap, setPendingTrap] = useState<TriggeredTrap | null>(null);
  const [trapDecisionPending, setTrapDecisionPending] = useState(false);
  const [solvedMaze, setSolvedMaze] = useState(false);

  useEffect(() => {
    params.then((p) => {
      setGameCode(p.gameCode);
      setState(null);
      setParticipantId(localStorage.getItem(getStorageKey(p.gameCode)));
      setPendingTrap(null);
      setSolvedMaze(false);
      setMessage("");
    });
  }, [params]);

  const loadState = useCallback(async (viewerParticipantId = participantId) => {
    if (!gameCode) return;
    const query = viewerParticipantId
        ? `?participantId=${encodeURIComponent(viewerParticipantId)}`
        : "";

        const res = await fetch(`/api/games/${gameCode}/state${query}`);
    const data = await res.json();
    if (res.ok) setState(data);
  }, [gameCode, participantId]);

  useEffect(() => {
    if (!gameCode) return;

    const firstLoadId = window.setTimeout(() => void loadState(), 0);
    const id = window.setInterval(() => void loadState(), 3000);

    return () => {
      window.clearTimeout(firstLoadId);
      window.clearInterval(id);
    };
  }, [gameCode, loadState]);

  const me = useMemo(() => {
    return state?.participants.find((p) => p.id === participantId) ?? null;
  }, [state, participantId]);

  async function joinGame() {
    const res = await fetch(`/api/games/${gameCode}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, color }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Could not join.");
      return;
    }

    localStorage.setItem(getStorageKey(gameCode), data.id);
    setParticipantId(data.id);
    setMessage("");
    await loadState(data.id);
  }

  async function move(toX: number, toY: number) {
    if (!participantId) return;

    const res = await fetch(`/api/games/${gameCode}/move`, {
        method: "POST",
        headers: {
        "Content-Type": "application/json",
        },
        body: JSON.stringify({ participantId, toX, toY }),
    });

    const data = await res.json();

    if (!res.ok) {
        setMessage(data.error || "Could not move.");
    } else if (data.triggeredTrap) {
        setPendingTrap(data.triggeredTrap);
        setSolvedMaze(Boolean(data.reachedGoal));
        setMessage("");
    } else {
        setSolvedMaze(Boolean(data.reachedGoal));
        setMessage("");
    }

    await loadState();
  }

  async function revealTrap(outcome: "success" | "fail") {
    if (!participantId || !pendingTrap) return;

    setTrapDecisionPending(true);

    const res = await fetch(`/api/games/${gameCode}/reveal-trap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        participantId,
        trapId: pendingTrap.id,
        outcome,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Could not reveal trap.");
      setTrapDecisionPending(false);
      return;
    }

    setPendingTrap(null);
    setTrapDecisionPending(false);
    setMessage("");
    await loadState();
  }

  async function endTurn() {
    if (!participantId) return;

    const res = await fetch(`/api/games/${gameCode}/end-turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ participantId }),
    });

    const data = await res.json();
    setMessage(res.ok ? "" : data.error || "Could not end turn.");
    await loadState();
  }

  if (!participantId) {
    return (
      <main className="min-h-screen bg-amber-50 text-stone-900 p-8 flex items-center justify-center">
        <div className="w-full max-w-md rounded-3xl border-4 border-amber-900/20 bg-white/70 p-8">
          <h1 className="text-3xl font-bold mb-2">Join game</h1>
          <p className="mb-6 text-stone-700">Game code: {gameCode}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your character name"
            className="w-full rounded-xl border border-stone-400 bg-white px-4 py-3 mb-4"
          />
          <div className="mb-4">
            <p className="mb-2 text-sm font-semibold text-stone-700">Choose your color</p>
            <div className="grid grid-cols-2 gap-2">
              {PLAYER_COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setColor(option.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                    color === option.value ? "border-stone-900 bg-stone-100" : "border-stone-300 bg-white"
                  }`}
                >
                  <span className={`h-5 w-5 rounded-full border border-stone-500 ${option.className}`} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={joinGame} className="rounded-xl bg-stone-800 px-5 py-3 text-white">
            Join
          </button>
          {message && <p className="mt-4 text-red-700">{message}</p>}
        </div>
      </main>
    );
  }

  if (!state || !me) {
    return <main className="min-h-screen p-8">Loading...</main>;
  }

  const currentState = state;
  const currentMe = me;

  function getTrapAtCell(x: number, y: number) {
    return currentState.traps.find((trap) => trap.x === x && trap.y === y) ?? null;
  }

  const canAct =
  state.game.status === "active" && !state.game.is_npc_turn && !me.has_ended_turn;

  const adjacentTargets =
    currentMe.x === null || currentMe.y === null
        ? []
        : [
            { x: currentMe.x + 1, y: currentMe.y },
            { x: currentMe.x - 1, y: currentMe.y },
            { x: currentMe.x, y: currentMe.y + 1 },
            { x: currentMe.x, y: currentMe.y - 1 },
        ].filter(
            (cell) =>
            cell.x >= 0 &&
            cell.y >= 0 &&
            cell.x < currentState.game.width &&
            cell.y < currentState.game.height
        );

  const visibleCells =
    currentMe.x !== null && currentMe.y !== null
        ? getVisibleCellKeys(
            currentMe.x,
            currentMe.y,
            currentState.game.width,
            currentState.game.height,
            currentState.walls
        )
        : new Set<string>();

  function isInBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < currentState.game.width && y < currentState.game.height;
  }

  function hasWall(x: number, y: number, direction: WallDirection) {
    return currentState.walls.some((wall) => wallKey(wall) === wallKey({ x, y, direction }));
  }

  function hasWallBetween(fromX: number, fromY: number, toX: number, toY: number) {
    return isWallBetween(fromX, fromY, toX, toY, currentState.walls);
  }

  function isVisibleCell(x: number, y: number) {
    return isInBounds(x, y) && visibleCells.has(cellKey(x, y));
  }

  function isVisibleWallBetween(fromX: number, fromY: number, toX: number, toY: number) {
    const visible = isVisibleCell(fromX, fromY) || isVisibleCell(toX, toY);
    const wall = !isInBounds(fromX, fromY) || !isInBounds(toX, toY) || hasWallBetween(fromX, fromY, toX, toY);
    return visible && wall;
  }

  const viewportCells =
    currentMe.x === null || currentMe.y === null
      ? []
      : Array.from({ length: PLAYER_VIEW_SIZE * PLAYER_VIEW_SIZE }).map((_, index) => {
          const viewX = index % PLAYER_VIEW_SIZE;
          const viewY = Math.floor(index / PLAYER_VIEW_SIZE);
          const x = currentMe.x! + viewX - PLAYER_CENTER_OFFSET;
          const y = currentMe.y! + viewY - PLAYER_CENTER_OFFSET;
          const inBounds =
            x >= 0 &&
            y >= 0 &&
            x < currentState.game.width &&
            y < currentState.game.height;

          return { viewX, viewY, x, y, inBounds };
        });

  return (
    <main className="min-h-screen bg-amber-50 text-stone-900 p-8">
      <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl border-4 border-amber-900/20 bg-white/70 p-6">
          <h1 className="text-3xl font-bold mb-2">{me.name}</h1>
          <p className="text-stone-700 mb-2">{currentState.game.name}</p>
          <p className="text-stone-700 mb-4">
            {me.x === null ? "Waiting for GM position..." : `Position: (${me.x}, ${me.y})`}
          </p>
          <p className="text-stone-700 mb-4">
            {state.game.is_npc_turn
              ? "The GM is taking the shared NPC turn."
              : canAct && me.remaining_moves > 0
              ? `Player turn - moves left: ${me.remaining_moves}`
              : canAct
              ? "No moves left - end your turn"
              : me.has_ended_turn
              ? "Waiting for the other players to end their turns"
              : "Waiting for the player turn"}
          </p>

          <button
            onClick={endTurn}
            disabled={!canAct}
            className="rounded-xl bg-stone-800 px-5 py-3 text-white disabled:opacity-40"
          >
            End turn
          </button>

          {message && <p className="mt-4 text-red-700">{message}</p>}
        </aside>

        <section className="rounded-3xl border-4 border-amber-900/20 bg-white/70 p-6">
          <h2 className="text-2xl font-bold mb-4">Maze</h2>
          <div
            key={`${currentState.game.code}-grid-${currentMe.x}-${currentMe.y}`}
            className="grid gap-0 rounded-md bg-stone-300"
            style={{
              gridTemplateColumns: Array.from({ length: PLAYER_VIEW_SIZE * 2 - 1 }, (_, index) =>
                index % 2 === 0 ? "minmax(0, 1fr)" : "6px"
              ).join(" "),
              gridTemplateRows: Array.from({ length: PLAYER_VIEW_SIZE * 2 - 1 }, (_, index) =>
                index % 2 === 0 ? "auto" : "6px"
              ).join(" "),
            }}
          >
            {Array.from({ length: (PLAYER_VIEW_SIZE * 2 - 1) * (PLAYER_VIEW_SIZE * 2 - 1) }).map((_, index) => {
                const gridWidth = PLAYER_VIEW_SIZE * 2 - 1;
                const gridX = index % gridWidth;
                const gridY = Math.floor(index / gridWidth);

                if (currentMe.x === null || currentMe.y === null) return null;

                if (gridX % 2 === 1 && gridY % 2 === 1) {
                  const leftX = currentMe.x + Math.floor(gridX / 2) - PLAYER_CENTER_OFFSET;
                  const rightX = leftX + 1;
                  const topY = currentMe.y + Math.floor(gridY / 2) - PLAYER_CENTER_OFFSET;
                  const bottomY = topY + 1;
                  const connectedWall =
                    isVisibleWallBetween(leftX, topY, rightX, topY) ||
                    isVisibleWallBetween(leftX, bottomY, rightX, bottomY) ||
                    isVisibleWallBetween(leftX, topY, leftX, bottomY) ||
                    isVisibleWallBetween(rightX, topY, rightX, bottomY);
                  const visible =
                    isVisibleCell(leftX, topY) ||
                    isVisibleCell(rightX, topY) ||
                    isVisibleCell(leftX, bottomY) ||
                    isVisibleCell(rightX, bottomY);

                  return (
                    <div
                      key={`${currentState.game.code}-corner-${gridX}-${gridY}`}
                      className={connectedWall ? "bg-stone-700" : visible ? "bg-amber-50" : "bg-stone-200"}
                    />
                  );
                }

                if (gridX % 2 === 1) {
                  const leftX = currentMe.x + Math.floor(gridX / 2) - PLAYER_CENTER_OFFSET;
                  const rightX = leftX + 1;
                  const y = currentMe.y + gridY / 2 - PLAYER_CENTER_OFFSET;
                  const leftInBounds = isInBounds(leftX, y);
                  const rightInBounds = isInBounds(rightX, y);
                  const visible = isVisibleCell(leftX, y) || isVisibleCell(rightX, y);
                  const wall = !leftInBounds || !rightInBounds || hasWall(leftX, y, "right");

                  return (
                    <div
                      key={`${currentState.game.code}-wall-right-${leftX}-${y}`}
                      className={`h-full w-full ${
                        wall && visible
                          ? "bg-stone-700"
                          : !visible
                          ? "bg-stone-200"
                          : "bg-amber-50"
                      }`}
                    />
                  );
                }

                if (gridY % 2 === 1) {
                  const x = currentMe.x + gridX / 2 - PLAYER_CENTER_OFFSET;
                  const topY = currentMe.y + Math.floor(gridY / 2) - PLAYER_CENTER_OFFSET;
                  const bottomY = topY + 1;
                  const topInBounds = isInBounds(x, topY);
                  const bottomInBounds = isInBounds(x, bottomY);
                  const visible = isVisibleCell(x, topY) || isVisibleCell(x, bottomY);
                  const wall = !topInBounds || !bottomInBounds || hasWall(x, topY, "down");

                  return (
                    <div
                      key={`${currentState.game.code}-wall-down-${x}-${topY}`}
                      className={`h-full w-full ${
                        wall && visible
                          ? "bg-stone-700"
                          : !visible
                          ? "bg-stone-200"
                          : "bg-amber-50"
                      }`}
                    />
                  );
                }

                const viewX = gridX / 2;
                const viewY = gridY / 2;
                const cell = viewportCells[viewY * PLAYER_VIEW_SIZE + viewX];
                const visible = cell.inBounds && visibleCells.has(cellKey(cell.x, cell.y));
                const occupant = visible ? currentState.participants.find((p) => p.x === cell.x && p.y === cell.y) : null;
                const wall = !cell.inBounds;
                const canMoveHere =
                    visible &&
                    canAct &&
                    currentMe.remaining_moves > 0 &&
                    adjacentTargets.some((target) => target.x === cell.x && target.y === cell.y) &&
                    currentMe.x !== null &&
                    currentMe.y !== null &&
                    !hasWallBetween(currentMe.x, currentMe.y, cell.x, cell.y);
                const trap = visible ? getTrapAtCell(cell.x, cell.y) : null;

                return (
                    <button
                    key={`${currentState.game.code}-cell-${cell.viewX}-${cell.viewY}`}
                    onClick={() => canMoveHere && move(cell.x, cell.y)}
                    disabled={!canMoveHere}
                    className={`aspect-square rounded-md border text-xs font-bold ${
                        wall
                            ? "bg-stone-700 border-stone-800 text-transparent"
                            : !visible
                            ? "bg-stone-200 border-stone-300 text-transparent"
                            : occupant?.id === currentMe.id
                            ? participantCellClass(occupant)
                            : occupant
                            ? participantCellClass(occupant)
                            : trap
                            ? trap.is_triggered
                            ? "bg-red-300 border-red-700 text-red-900"
                            : "bg-amber-200 border-amber-700 text-amber-900"
                            : canMoveHere
                            ? "bg-emerald-100 border-emerald-500 hover:bg-emerald-200"
                            : "bg-amber-50 border-stone-300"
                    }`}
                    >
                    {!visible || wall ? "" : occupant ? occupant.name.slice(0, 1).toUpperCase() : ""}
                    </button>
                );
            })}
          </div>
        </section>
      </div>

      {pendingTrap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border-4 border-stone-800 bg-white p-6 text-center shadow-xl">
            <h2 className="text-2xl font-bold mb-2">make a save, ask DM</h2>
            <p className="mb-6 text-stone-700">{pendingTrap.label}</p>

            <div className="flex justify-center gap-3">
              <button
                onClick={() => void revealTrap("success")}
                disabled={trapDecisionPending}
                className="rounded-lg bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-40"
              >
                Success
              </button>
              <button
                onClick={() => void revealTrap("fail")}
                disabled={trapDecisionPending}
                className="rounded-lg bg-red-700 px-5 py-3 font-bold text-white disabled:opacity-40"
              >
                Fail
              </button>
            </div>
          </div>
        </div>
      )}

      {solvedMaze && !pendingTrap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border-4 border-lime-800 bg-white p-6 text-center shadow-xl">
            <h2 className="text-2xl font-bold mb-6">You solved the maze!</h2>

            <button
              onClick={() => setSolvedMaze(false)}
              className="rounded-lg bg-lime-700 px-5 py-3 font-bold text-white"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
