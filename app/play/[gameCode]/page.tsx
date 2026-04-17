"use client";

import { useEffect, useMemo, useState } from "react";

type Participant = {
  id: string;
  name: string;
  kind: "player" | "npc";
  x: number | null;
  y: number | null;
  turn_order: number | null;
  remaining_moves: number;
};

type GameState = {
  game: {
    code: string;
    name: string;
    width: number;
    height: number;
    status: "setup" | "active" | "finished";
  };
  participants: Participant[];
  activeParticipantId: string | null;
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
    const res = await fetch(`/api/games/${gameCode}/state`);
    const data = await res.json();
    if (res.ok) setState(data);
  }

  useEffect(() => {
    if (!gameCode) return;
    void loadState();
    const id = window.setInterval(() => void loadState(), 3000);
    return () => window.clearInterval(id);
  }, [gameCode]);

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
    setMessage(res.ok ? "" : data.error || "Could not move.");
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

  const isMyTurn = state.activeParticipantId === me.id;
  const adjacentTargets =
    me.x === null || me.y === null
      ? []
      : [
          { x: me.x + 1, y: me.y },
          { x: me.x - 1, y: me.y },
          { x: me.x, y: me.y + 1 },
          { x: me.x, y: me.y - 1 },
        ].filter(
          (cell) =>
            cell.x >= 0 &&
            cell.y >= 0 &&
            cell.x < state.game.width &&
            cell.y < state.game.height
        );

  return (
    <main className="min-h-screen bg-amber-50 text-stone-900 p-8">
      <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl border-4 border-amber-900/20 bg-white/70 p-6">
          <h1 className="text-3xl font-bold mb-2">{me.name}</h1>
          <p className="text-stone-700 mb-2">{state.game.name}</p>
          <p className="text-stone-700 mb-4">
            {me.x === null ? "Waiting for GM position..." : `Position: (${me.x}, ${me.y})`}
          </p>
          <p className="text-stone-700 mb-4">
            {isMyTurn ? `Your turn • moves left: ${me.remaining_moves}` : "Waiting for your turn"}
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
              gridTemplateColumns: `repeat(${state.game.width}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: state.game.width * state.game.height }).map((_, index) => {
              const x = index % state.game.width;
              const y = Math.floor(index / state.game.width);
              const occupant = state.participants.find((p) => p.x === x && p.y === y);
              const canMoveHere =
                isMyTurn && adjacentTargets.some((cell) => cell.x === x && cell.y === y);

              return (
                <button
                  key={`${x}-${y}`}
                  onClick={() => canMoveHere && move(x, y)}
                  disabled={!canMoveHere}
                  className={`aspect-square rounded-md border text-xs font-bold ${
                    occupant?.id === me.id
                      ? "bg-blue-300 border-blue-700"
                      : occupant
                      ? "bg-stone-300 border-stone-600"
                      : canMoveHere
                      ? "bg-emerald-100 border-emerald-500 hover:bg-emerald-200"
                      : "bg-amber-50 border-stone-300"
                  }`}
                >
                  {occupant?.id === me.id ? "ME" : occupant ? occupant.name.slice(0, 2).toUpperCase() : ""}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}