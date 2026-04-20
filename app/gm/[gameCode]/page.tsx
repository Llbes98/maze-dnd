"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isWallBetween, wallKey, type Cell, type WallDirection } from "@/lib/maze-visibility";

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
    move_points_per_turn: number;
    is_npc_turn: boolean;
};
  walls: Wall[];
  goals: Cell[];
  traps: Trap[];
  participants: Participant[];
  activeParticipantId: string | null;
  activeTurnKind: ActiveTurnKind;
};

type ActiveTurnKind = "player" | "npc";
type PlayerColor =
  | "red"
  | "dark-green"
  | "light-green"
  | "dark-blue"
  | "light-blue"
  | "purple"
  | "yellow"
  | "orange";

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

function normalizePlayerColor(color: string | undefined, kind: "player" | "npc"): PlayerColor {
  if (Object.keys(PARTICIPANT_COLOR_CLASSES).includes(color ?? "")) {
    return color as PlayerColor;
  }

  return kind === "npc" ? "orange" : "red";
}

function participantCellClass(participant: Participant) {
  return PARTICIPANT_COLOR_CLASSES[normalizePlayerColor(participant.color, participant.kind)];
}

export default function GMPage({ params }: { params: Promise<{ gameCode: string }> }) {
  const [gameCode, setGameCode] = useState("");
  const [state, setState] = useState<GameState | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [editMode, setEditMode] = useState<"assign" | "walls" | "traps" | "goals">("assign");
  const [trapLabel, setTrapLabel] = useState("Trap");
  const [trapVisibilityMode, setTrapVisibilityMode] = useState<"hidden" | "public">("hidden");
  const [npcName, setNpcName] = useState("NPC 1");
  
  function hasWall(x: number, y: number, direction: WallDirection) {
    if (!state) return false;
    return state.walls.some((wall) => wallKey(wall) === wallKey({ x, y, direction }));
}

function hasWallBetween(fromX: number, fromY: number, toX: number, toY: number) {
  return state ? isWallBetween(fromX, fromY, toX, toY, state.walls) : false;
}

function getTrapAtCell(x: number, y: number) {
  return state?.traps.find((trap) => trap.x === x && trap.y === y) ?? null;
}

function isGoalCell(x: number, y: number) {
  return state?.goals.some((goal) => goal.x === x && goal.y === y) ?? false;
}

async function toggleGoal(x: number, y: number) {
  if (!gameCode) return;

  const res = await fetch(`/api/games/${gameCode}/toggle-goal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ x, y }),
  });

  const data = await res.json();

  if (!res.ok) {
    setMessage(data.error || "Could not toggle goal.");
    return;
  }

  setMessage("Goal updated.");
  await loadState();
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

    async function toggleWall(x: number, y: number, direction: WallDirection) {
        if (!gameCode) return;

        const res = await fetch(`/api/games/${gameCode}/toggle-wall`, {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            },
            body: JSON.stringify({ x, y, direction }),
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
    params.then((p) => {
      setGameCode(p.gameCode);
      setState(null);
      setSelectedParticipantId(null);
      setMessage("");
    });
  }, [params]);

  const loadState = useCallback(async () => {
    if (!gameCode) return;

    const res = await fetch(`/api/games/${gameCode}/state?viewer=gm`);
    const data = await res.json();

    if (res.ok) {
      setState(data);
    }
  }, [gameCode]);

  useEffect(() => {
  if (!gameCode) return;

  const firstLoadId = window.setTimeout(() => void loadState(), 0);

  const id = window.setInterval(() => void loadState(), 3000);
  return () => {
    window.clearTimeout(firstLoadId);
    window.clearInterval(id);
  };
  }, [gameCode, loadState]);

  const orderedParticipants = useMemo(() => {
    return [...(state?.participants ?? [])].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "player" ? -1 : 1;
      return a.name.localeCompare(b.name);
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

  async function startGame() {
    if (!gameCode) return;

    const res = await fetch(`/api/games/${gameCode}/start`, { method: "POST" });
    const data = await res.json();

    setMessage(res.ok ? "Game started." : data.error || "Could not start game.");
    await loadState();
  }

  async function copyMazeLayout() {
    if (!state) return;

    const layout = {
      mazeLayoutVersion: 1,
      sourceGameCode: state.game.code,
      name: state.game.name,
      width: state.game.width,
      height: state.game.height,
      walls: state.walls,
      goals: state.goals,
      traps: state.traps.map((trap) => ({
        x: trap.x,
        y: trap.y,
        label: trap.label,
        visibilityMode: trap.visibility_mode === "public" ? "public" : "hidden",
      })),
    };
    const text = JSON.stringify(layout, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      setMessage("Maze layout copied.");
    } catch {
      window.prompt("Copy maze layout", text);
      setMessage("Maze layout ready to copy.");
    }
  }

  async function pasteMazeLayout() {
    if (!gameCode) return;

    let text = "";

    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = window.prompt("Paste maze layout JSON") ?? "";
    }

    if (!text.trim()) {
      setMessage("No maze layout pasted.");
      return;
    }

    let layout: unknown;

    try {
      layout = JSON.parse(text);
    } catch {
      setMessage("That maze layout is not valid JSON.");
      return;
    }

    const res = await fetch(`/api/games/${gameCode}/apply-layout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ layout }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Could not paste maze layout.");
      return;
    }

    setSelectedParticipantId(null);
    setMessage("Maze layout pasted.");
    await loadState();
  }

  async function addNpc() {
  if (!gameCode) return;

  const res = await fetch(`/api/games/${gameCode}/add-npc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: npcName }),
  });

  const data = await res.json();

  if (!res.ok) {
    setMessage(data.error || "Could not add NPC.");
    return;
  }

  setMessage("NPC added.");
  setNpcName(`NPC ${Math.floor(Math.random() * 100)}`);
  await loadState();
}

async function moveNpc(participantId: string, toX: number, toY: number) {
  if (!gameCode) return;

  const res = await fetch(`/api/games/${gameCode}/move-npc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ participantId, toX, toY }),
  });

  const data = await res.json();

  if (!res.ok) {
    setMessage(data.error || "Could not move NPC.");
    return;
  }

  setMessage("NPC moved.");
  await loadState();
}

async function updatePlayerMoves(participantId: string, moves: number) {
  if (!gameCode) return;

  const res = await fetch(`/api/games/${gameCode}/player-moves`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ participantId, moves }),
  });

  const data = await res.json();

  if (!res.ok) {
    setMessage(data.error || "Could not update player moves.");
    return;
  }

  setMessage("Player moves updated.");
  await loadState();
}

async function endNpcTurn() {
  if (!gameCode) return;

  const res = await fetch(`/api/games/${gameCode}/end-npc-turn`, {
    method: "POST",
  });

  const data = await res.json();

  if (!res.ok) {
    setMessage(data.error || "Could not end NPC turn.");
    return;
  }

  setMessage("NPC turn ended.");
  await loadState();
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
            {orderedParticipants.map((participant) => (
              <div
                key={`${state.game.code}-participant-${participant.id}`}
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
                  <div className="font-semibold">
                    {participant.name}{" "}
                    <span className="text-xs text-stone-500 uppercase">({participant.kind})</span>
                  </div>
                  <div className="text-sm text-stone-600">
                    {participant.x === null ? "No position" : `(${participant.x}, ${participant.y})`}
                  </div>
                  {participant.kind === "player" && (
                    <div className="text-sm text-stone-600">
                      {participant.has_ended_turn
                        ? "Ended turn"
                        : `Moves left: ${participant.remaining_moves}`}
                    </div>
                  )}
                </button>

                {participant.kind === "player" && (
                  <label className="mt-3 block text-sm text-stone-700">
                    Moves per turn
                    <input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={participant.move_points_per_turn ?? state.game.move_points_per_turn}
                      onBlur={(event) => {
                        const moves = Number(event.target.value);
                        if (Number.isInteger(moves)) {
                          void updatePlayerMoves(participant.id, moves);
                        }
                      }}
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
                    />
                  </label>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button onClick={startGame} className="rounded-xl bg-emerald-700 px-4 py-3 text-white">
              Start game
            </button>
            <button onClick={copyMazeLayout} className="rounded-xl bg-stone-700 px-4 py-3 text-white">
              Copy maze layout
            </button>
            <button onClick={pasteMazeLayout} className="rounded-xl bg-stone-700 px-4 py-3 text-white">
              Paste maze layout
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

                <button
                onClick={() => setEditMode("goals")}
                className={`rounded-xl px-4 py-2 ${
                    editMode === "goals" ? "bg-stone-800 text-white" : "bg-stone-200"
                }`}
                >
                Edit goals
                </button>
            </div>

            <p className="mt-3 text-sm text-stone-700">
                Current mode:{" "}
                <span className="font-bold">
                {editMode === "assign"
                    ? "Assign positions"
                    : editMode === "walls"
                    ? "Edit walls"
                    : editMode === "goals"
                    ? "Edit goals"
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

        {editMode === "walls" && (
            <div className="mt-4 rounded-2xl border border-stone-300 bg-white p-4">
                <h3 className="text-lg font-bold mb-2">Wall settings</h3>
                <p className="text-sm text-stone-600">
                Click the thin lanes between squares to place or remove walls.
                </p>
            </div>
        )}

        {editMode === "goals" && (
            <div className="mt-4 rounded-2xl border border-stone-300 bg-white p-4">
                <h3 className="text-lg font-bold mb-2">Goal settings</h3>
                <p className="text-sm text-stone-600">
                Click a square on the grid to mark or remove a maze goal.
                </p>
            </div>
        )}

        <div className="mt-6 rounded-2xl border border-stone-300 bg-white p-4">
          <h3 className="text-lg font-bold mb-3">NPCs</h3>

          <div className="flex gap-3 mb-4">
            <input
              value={npcName}
              onChange={(e) => setNpcName(e.target.value)}
              className="flex-1 rounded-xl border border-stone-400 bg-white px-4 py-2"
              placeholder="NPC name"
            />
            <button
              onClick={addNpc}
              className="rounded-xl bg-stone-800 px-4 py-2 text-white"
            >
              Add NPC
            </button>
          </div>

          <p className="text-sm text-stone-700">
            You can add up to 4 NPCs. They share one GM-controlled turn at the end of each round.
          </p>
        </div>

        {state.game.is_npc_turn && (
          <div className="mt-6 rounded-2xl border border-emerald-400 bg-emerald-50 p-4">
            <h3 className="text-lg font-bold mb-2">NPC turn active</h3>
            <p className="text-sm text-stone-700 mb-4">
              Move any NPCs you want. When finished, end the NPC turn.
            </p>

            <button
              onClick={endNpcTurn}
              className="rounded-xl bg-emerald-700 px-4 py-3 text-white"
            >
              End NPC turn
            </button>
          </div>
        )}

          {message && <p className="mt-4 text-sm text-stone-700">{message}</p>}
        </aside>

        <section className="rounded-3xl border-4 border-amber-900/20 bg-white/70 p-6">
          <h2 className="text-2xl font-bold mb-4">Grid</h2>
          <div
            key={`${state.game.code}-grid-${state.game.width}-${state.game.height}`}
            className="grid gap-0 rounded-md bg-stone-300"
            style={{
              gridTemplateColumns: Array.from({ length: state.game.width * 2 - 1 }, (_, index) =>
                index % 2 === 0 ? "minmax(0, 1fr)" : "8px"
              ).join(" "),
              gridTemplateRows: Array.from({ length: state.game.height * 2 - 1 }, (_, index) =>
                index % 2 === 0 ? "auto" : "8px"
              ).join(" "),
            }}
          >
            {Array.from({ length: (state.game.width * 2 - 1) * (state.game.height * 2 - 1) }).map((_, index) => {
                const gridWidth = state.game.width * 2 - 1;
                const gridX = index % gridWidth;
                const gridY = Math.floor(index / gridWidth);

                if (gridX % 2 === 1 && gridY % 2 === 1) {
                  const x = Math.floor(gridX / 2);
                  const y = Math.floor(gridY / 2);
                  const connectedWall =
                    hasWall(x, y, "right") ||
                    hasWall(x, y + 1, "right") ||
                    hasWall(x, y, "down") ||
                    hasWall(x + 1, y, "down");

                  return (
                    <div
                      key={`${state.game.code}-corner-${gridX}-${gridY}`}
                      className={connectedWall ? "bg-stone-700" : "bg-amber-50"}
                    />
                  );
                }

                if (gridX % 2 === 1) {
                  const x = Math.floor(gridX / 2);
                  const y = gridY / 2;
                  const wall = hasWall(x, y, "right");

                  return (
                    <button
                      key={`${state.game.code}-wall-right-${x}-${y}`}
                      onClick={() => editMode === "walls" && void toggleWall(x, y, "right")}
                      disabled={editMode !== "walls"}
                      className={`h-full w-full ${
                        wall
                          ? "bg-stone-700"
                          : editMode === "walls"
                          ? "bg-stone-200 hover:bg-stone-400"
                          : "bg-amber-50"
                      }`}
                      title={`Wall between ${x},${y} and ${x + 1},${y}`}
                    />
                  );
                }

                if (gridY % 2 === 1) {
                  const x = gridX / 2;
                  const y = Math.floor(gridY / 2);
                  const wall = hasWall(x, y, "down");

                  return (
                    <button
                      key={`${state.game.code}-wall-down-${x}-${y}`}
                      onClick={() => editMode === "walls" && void toggleWall(x, y, "down")}
                      disabled={editMode !== "walls"}
                      className={`h-full w-full ${
                        wall
                          ? "bg-stone-700"
                          : editMode === "walls"
                          ? "bg-stone-200 hover:bg-stone-400"
                          : "bg-amber-50"
                      }`}
                      title={`Wall between ${x},${y} and ${x},${y + 1}`}
                    />
                  );
                }

                const x = gridX / 2;
                const y = gridY / 2;
                const occupant = state.participants.find((p) => p.x === x && p.y === y);
                const isActive = occupant?.id === state.activeParticipantId;
                const trap = getTrapAtCell(x, y);
                const goal = isGoalCell(x, y);

                const selectedParticipant = state.participants.find(
                  (p) => p.id === selectedParticipantId
                );

                const canMoveSelectedNpc =
                  state.game.is_npc_turn &&
                  selectedParticipant?.kind === "npc" &&
                  selectedParticipant.x !== null &&
                  selectedParticipant.y !== null &&
                  Math.abs(selectedParticipant.x - x) + Math.abs(selectedParticipant.y - y) === 1 &&
                  !hasWallBetween(selectedParticipant.x, selectedParticipant.y, x, y) &&
                  !occupant;

                return (
                    <button
                        key={`${state.game.code}-cell-${x}-${y}`}
                        onClick={() => {
                          if (state.game.is_npc_turn && selectedParticipant?.kind === "npc" && canMoveSelectedNpc) {
                            void moveNpc(selectedParticipant.id, x, y);
                          } else if (editMode === "walls") {
                            return;
                          } else if (editMode === "traps") {
                            void toggleTrap(x, y);
                          } else if (editMode === "goals") {
                            void toggleGoal(x, y);
                          } else {
                            void assignPosition(x, y);
                          }
                        }}
                        className={`aspect-square rounded-md border text-[clamp(0.45rem,1.2vw,0.75rem)] font-bold leading-none ${
                            occupant
                            ? isActive
                                ? `${participantCellClass(occupant)} ring-2 ring-emerald-700`
                                : participantCellClass(occupant)
                            : trap
                            ? trap.is_triggered
                                ? "bg-red-300 border-red-700 text-transparent"
                                : trap.visibility_mode === "public"
                                ? "bg-amber-200 border-amber-700 text-transparent"
                                : "bg-rose-100 border-rose-500 text-transparent"
                            : goal
                            ? "bg-lime-200 border-lime-500 text-transparent"
                            : "bg-amber-50 border-stone-300 hover:bg-amber-100"
                        }`}
                        title={`${x},${y}`}
                        >
                        {occupant
                            ? occupant.name.slice(0, 1).toUpperCase()
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
