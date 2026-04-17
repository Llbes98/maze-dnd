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
    move_points_per_turn: number;
  };
  participants: Participant[];
  activeParticipantId: string | null;
};

export default function GMPage({ params }: { params: Promise<{ gameCode: string }> }) {
  const [gameCode, setGameCode] = useState("");
  const [state, setState] = useState<GameState | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [turnOrderDirty, setTurnOrderDirty] = useState(false);
  

  useEffect(() => {
    params.then((p) => setGameCode(p.gameCode));
  }, [params]);

  async function loadState() {
    if (!gameCode) return;

    const res = await fetch(`/api/games/${gameCode}/state`);
    const data = await res.json();

    if (res.ok) {
      setState(data);
    }
  }

  useEffect(() => {
  if (!gameCode) return;

  void loadState();

  if (turnOrderDirty) return;

  const id = window.setInterval(() => void loadState(), 3000);
  return () => window.clearInterval(id);
  }, [gameCode, turnOrderDirty]);

  const orderedParticipants = useMemo(() => {
    return [...(state?.participants ?? [])].sort((a, b) => {
      const av = a.turn_order ?? 9999;
      const bv = b.turn_order ?? 9999;
      return av - bv;
    });
  }, [state]);

  async function assignPosition(x: number, y: number) {
    if (!selectedParticipantId || !gameCode) return;

    const res = await fetch(`/api/games/${gameCode}/assign-position`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ participantId: selectedParticipantId, x, y }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Could not assign position.");
      return;
    }

    setMessage("Position assigned.");
    await loadState();
  }

 async function saveTurnOrder() {
  if (!gameCode || !state) return;

  const ids = orderedParticipants.map((p) => p.id);

  const res = await fetch(`/api/games/${gameCode}/turn-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderedParticipantIds: ids }),
  });

  const data = await res.json();

  if (res.ok) {
    setMessage("Turn order saved.");
    setTurnOrderDirty(false);
  } else {
    setMessage(data.error || "Could not save turn order.");
  }

  await loadState();
}

  async function startGame() {
    if (!gameCode) return;

    const res = await fetch(`/api/games/${gameCode}/start`, { method: "POST" });
    const data = await res.json();

    setMessage(res.ok ? "Game started." : data.error || "Could not start game.");
    await loadState();
  }

  function moveParticipantUp(index: number) {
  if (!state || index === 0) return;

  const copy = [...orderedParticipants];
  [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];

  setState({
    ...state,
    participants: copy.map((p, i) => ({ ...p, turn_order: i })),
  });

  setTurnOrderDirty(true);
}

  function moveParticipantDown(index: number) {
  if (!state || index >= orderedParticipants.length - 1) return;

  const copy = [...orderedParticipants];
  [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];

  setState({
    ...state,
    participants: copy.map((p, i) => ({ ...p, turn_order: i })),
  });

  setTurnOrderDirty(true);
}

  if (!state) {
    return <main className="min-h-screen p-8">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-amber-50 text-stone-900 p-8">
      <div className="mx-auto max-w-7xl grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-3xl border-4 border-amber-900/20 bg-white/70 p-6">
          <h1 className="text-3xl font-bold mb-2">{state.game.name}</h1>
          <p className="mb-4 text-stone-700">GM code: {state.game.code}</p>
          <p className="mb-6 text-stone-700">
            Players join at <span className="font-semibold">/play/{state.game.code}</span>
          </p>

          <h2 className="text-xl font-bold mb-3">Participants</h2>
          <div className="space-y-3">
            {orderedParticipants.map((participant, index) => (
              <div
                key={participant.id}
                className={`rounded-2xl border p-3 ${
                  selectedParticipantId === participant.id
                    ? "border-stone-900 bg-amber-100"
                    : "border-stone-300 bg-white"
                }`}
              >
                <button
                  className="w-full text-left"
                  onClick={() => setSelectedParticipantId(participant.id)}
                >
                  <div className="font-semibold">{participant.name}</div>
                  <div className="text-sm text-stone-600">
                    {participant.x === null ? "No position" : `(${participant.x}, ${participant.y})`}
                  </div>
                </button>

                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => moveParticipantUp(index)}
                    className="rounded-lg bg-stone-200 px-2 py-1 text-sm"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveParticipantDown(index)}
                    className="rounded-lg bg-stone-200 px-2 py-1 text-sm"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button onClick={saveTurnOrder} className="rounded-xl bg-stone-800 px-4 py-3 text-white">
              Save turn order
            </button>
            <button onClick={startGame} className="rounded-xl bg-emerald-700 px-4 py-3 text-white">
              Start game
            </button>
          </div>

          {message && <p className="mt-4 text-sm text-stone-700">{message}</p>}
        </aside>

        <section className="rounded-3xl border-4 border-amber-900/20 bg-white/70 p-6">
          <h2 className="text-2xl font-bold mb-4">Grid</h2>
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
              const isActive = occupant?.id === state.activeParticipantId;

              return (
                <button
                  key={`${x}-${y}`}
                  onClick={() => assignPosition(x, y)}
                  className={`aspect-square rounded-md border text-xs font-bold ${
                    occupant
                      ? isActive
                        ? "bg-emerald-300 border-emerald-700"
                        : "bg-stone-300 border-stone-600"
                      : "bg-amber-50 border-stone-300 hover:bg-amber-100"
                  }`}
                  title={`${x},${y}`}
                >
                  {occupant ? occupant.name.slice(0, 2).toUpperCase() : ""}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}