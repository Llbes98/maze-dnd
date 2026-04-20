"use client";

import { useEffect, useMemo, useState } from "react";
import { cellKey, getVisibleCellKeys } from "@/lib/maze-visibility";

type Participant = {
  id: string;
  name: string;
  kind: "player" | "npc";
  x: number | null;
  y: number | null;
  turn_order: number | null;
  remaining_moves: number;
};

type Trap = {
  id: string;
  x: number;
  y: number;
  label: string;
  visibility_mode: "hidden" | "public" | "selective";
  is_triggered: boolean;
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
  walls: { x: number; y: number }[];
  traps: Trap[];
  participants: Participant[];
  activeParticipantId: string | null;
  activeTurnKind: "player" | "npc";
};

function getStorageKey(gameCode: string) {
  return `maze-player-id:${gameCode}`;
}

export default function PlayerPage({ params }: { params: Promise<{ gameCode: string }> }) {
  const [gameCode, setGameCode] = useState("");
  const [state, setState] = useState<GameState | null>(null);
  const [name, setName] = useState("");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    params.then((p) => setGameCode(p.gameCode));
  }, [params]);

  useEffect(() => {
    if (!gameCode) return;
    const saved = localStorage.getItem(getStorageKey(gameCode));
    if (saved) setParticipantId(saved);
  }, [gameCode]);

  async function loadState() {
    if (!gameCode) return;
    const query = participantId
        ? `?participantId=${encodeURIComponent(participantId)}`
        : "";

        const res = await fetch(`/api/games/${gameCode}/state${query}`);
    const data = await res.json();
    if (res.ok) setState(data);
  }

  useEffect(() => {
    if (!gameCode) return;

    void loadState();
    const id = window.setInterval(() => void loadState(), 3000);

    return () => window.clearInterval(id);
  }, [gameCode, participantId]);

  const me = useMemo(() => {
    return state?.participants.find((p) => p.id === participantId) ?? null;
  }, [state, participantId]);

  async function joinGame() {
    const res = await fetch(`/api/games/${gameCode}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Could not join.");
      return;
    }

    localStorage.setItem(getStorageKey(gameCode), data.id);
    setParticipantId(data.id);
    setMessage("");
    await loadState();
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
        setMessage(`Trap triggered: ${data.triggeredTrap.label}`);
    } else {
        setMessage("");
    }

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

  const isMyTurn =
  !state.game.is_npc_turn && state.activeParticipantId === me.id;

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

  function isWallCell(x: number, y: number) {
    return currentState.walls.some((wall) => wall.x === x && wall.y === y);
  }

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
              : isMyTurn
              ? `Your turn • moves left: ${me.remaining_moves}`
              : "Waiting for your turn"}
          </p>

          <button
            onClick={endTurn}
            disabled={!isMyTurn}
            className="rounded-xl bg-stone-800 px-5 py-3 text-white disabled:opacity-40"
          >
            End turn
          </button>

          {message && <p className="mt-4 text-red-700">{message}</p>}
        </aside>

        <section className="rounded-3xl border-4 border-amber-900/20 bg-white/70 p-6">
          <h2 className="text-2xl font-bold mb-4">Maze</h2>
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${currentState.game.width}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: currentState.game.width * currentState.game.height }).map((_, index) => {
                const x = index % currentState.game.width;
                const y = Math.floor(index / currentState.game.width);
                const key = cellKey(x, y);
                const visible = visibleCells.has(key);
                const occupant = visible ? currentState.participants.find((p) => p.x === x && p.y === y) : null;
                const wall = visible && isWallCell(x, y);
                const canMoveHere =
                    visible &&
                    isMyTurn &&
                    !wall &&
                    adjacentTargets.some((cell) => cell.x === x && cell.y === y);
                const trap = visible ? getTrapAtCell(x, y) : null;

                return (
                    <button
                    key={`${x}-${y}`}
                    onClick={() => canMoveHere && move(x, y)}
                    disabled={!canMoveHere}
                    className={`aspect-square rounded-md border text-xs font-bold ${
                        !visible
                            ? "bg-stone-900 border-stone-950 text-transparent"
                            : wall
                            ? "bg-stone-700 border-stone-900 text-stone-100"
                            : occupant?.id === currentMe.id
                            ? "bg-blue-300 border-blue-700"
                            : occupant
                            ? "bg-stone-300 border-stone-600"
                            : trap
                            ? trap.is_triggered
                            ? "bg-red-300 border-red-700 text-red-900"
                            : "bg-amber-200 border-amber-700 text-amber-900"
                            : canMoveHere
                            ? "bg-emerald-100 border-emerald-500 hover:bg-emerald-200"
                            : "bg-amber-50 border-stone-300"
                    }`}
                    >
                    {!visible ? "" : wall ? "■" : occupant?.id === me.id ? "ME" : occupant ? occupant.name.slice(0, 2).toUpperCase() : trap ? "!" : ""}
                    </button>
                );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}