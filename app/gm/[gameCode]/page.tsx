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
    move_points_per_turn: number;
  };
  walls: { x: number; y: number }[];
  traps: Trap[];
  participants: Participant[];
  activeParticipantId: string | null;
};

export default function GMPage({ params }: { params: Promise<{ gameCode: string }> }) {
  const [gameCode, setGameCode] = useState("");
  const [state, setState] = useState<GameState | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [turnOrderDirty, setTurnOrderDirty] = useState(false);
  const [editMode, setEditMode] = useState<"assign" | "walls" | "traps">("assign");
  const [trapLabel, setTrapLabel] = useState("Trap");
  const [trapVisibilityMode, setTrapVisibilityMode] = useState<"hidden" | "public">("hidden");
  
  function isWallCell(x: number, y: number) {
    return state?.walls.some((wall) => wall.x === x && wall.y === y) ?? false;
}

function isTrapCell(x: number, y: number) {
  return state?.traps.some((trap) => trap.x === x && trap.y === y) ?? false;
}

function getTrapAtCell(x: number, y: number) {
  return state?.traps.find((trap) => trap.x === x && trap.y === y) ?? null;
}

async function toggleTrap(x: number, y: number) {
  if (!gameCode) return;

  const res = await fetch(`/api/games/${gameCode}/toggle-trap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      x,
      y,
      label: trapLabel,
      visibilityMode: trapVisibilityMode,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    setMessage(data.error || "Could not toggle trap.");
    return;
  }

  setMessage("Trap updated.");
  await loadState();
}

    async function toggleWall(x: number, y: number) {
        if (!gameCode) return;

        const res = await fetch(`/api/games/${gameCode}/toggle-wall`, {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            },
            body: JSON.stringify({ x, y }),
        });

        const data = await res.json();
        if (!res.ok) {
            setMessage(data.error || "Could not toggle wall.");
            return;
        }

        setMessage("Wall updated.");
        await loadState();
    }

  useEffect(() => {
    params.then((p) => setGameCode(p.gameCode));
  }, [params]);

  async function loadState() {
    if (!gameCode) return;

    const res = await fetch(`/api/games/${gameCode}/state?viewer=gm`);
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

        <div className="mt-6">
            <div className="flex gap-3 flex-wrap">
                <button
                onClick={() => setEditMode("assign")}
                className={`rounded-xl px-4 py-2 ${
                    editMode === "assign" ? "bg-stone-800 text-white" : "bg-stone-200"
                }`}
                >
                Assign positions
                </button>

                <button
                onClick={() => setEditMode("walls")}
                className={`rounded-xl px-4 py-2 ${
                    editMode === "walls" ? "bg-stone-800 text-white" : "bg-stone-200"
                }`}
                >
                Edit walls
                </button>

                <button
                onClick={() => setEditMode("traps")}
                className={`rounded-xl px-4 py-2 ${
                    editMode === "traps" ? "bg-stone-800 text-white" : "bg-stone-200"
                }`}
                >
                Edit traps
                </button>
            </div>

            <p className="mt-3 text-sm text-stone-700">
                Current mode:{" "}
                <span className="font-bold">
                {editMode === "assign"
                    ? "Assign positions"
                    : editMode === "walls"
                    ? "Edit walls"
                    : "Edit traps"}
                </span>
            </p>
        </div>

        {editMode === "traps" && (
            <div className="mt-4 rounded-2xl border border-stone-300 bg-white p-4">
                <h3 className="text-lg font-bold mb-3">Trap settings</h3>

                <label className="block text-sm text-stone-700 mb-2">Trap label</label>
                <input
                value={trapLabel}
                onChange={(e) => setTrapLabel(e.target.value)}
                className="w-full rounded-xl border border-stone-400 bg-white px-4 py-2 mb-4"
                placeholder="Trap"
                />

                <label className="block text-sm text-stone-700 mb-2">Visibility</label>
                <select
                value={trapVisibilityMode}
                onChange={(e) =>
                    setTrapVisibilityMode(e.target.value as "hidden" | "public")
                }
                className="w-full rounded-xl border border-stone-400 bg-white px-4 py-2"
                >
                <option value="hidden">Hidden from players</option>
                <option value="public">Visible to all players</option>
                </select>

                <p className="mt-3 text-sm text-stone-600">
                Click a square on the grid to place or remove a trap.
                </p>
            </div>
        )}

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
                const wall = isWallCell(x, y);
                const isActive = occupant?.id === state.activeParticipantId;
                const trap = getTrapAtCell(x, y);

                return (
                    <button
                        key={`${x}-${y}`}
                        onClick={() => {
                            if (editMode === "walls") {
                            void toggleWall(x, y);
                            } else if (editMode === "traps") {
                            void toggleTrap(x, y);
                            } else {
                            void assignPosition(x, y);
                            }
                        }}
                        className={`aspect-square rounded-md border text-xs font-bold ${
                            wall
                            ? "bg-stone-700 border-stone-900 text-stone-100"
                            : occupant
                            ? isActive
                                ? "bg-emerald-300 border-emerald-700"
                                : "bg-stone-300 border-stone-600"
                            : trap
                            ? trap.is_triggered
                                ? "bg-red-300 border-red-700 text-red-900"
                                : trap.visibility_mode === "public"
                                ? "bg-amber-200 border-amber-700 text-amber-900"
                                : "bg-rose-100 border-rose-500 text-rose-800"
                            : "bg-amber-50 border-stone-300 hover:bg-amber-100"
                        }`}
                        title={`${x},${y}`}
                        >
                        {wall
                            ? "■"
                            : occupant
                            ? occupant.name.slice(0, 2).toUpperCase()
                            : trap
                            ? "!"
                            : ""}
                    </button>
                );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}