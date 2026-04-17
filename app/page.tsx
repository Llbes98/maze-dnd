"use client";

import { useState } from "react";

export default function HomePage() {
  const [name, setName] = useState("Dungeon Session");
  const [width, setWidth] = useState(10);
  const [height, setHeight] = useState(10);
  const [movePointsPerTurn, setMovePointsPerTurn] = useState(5);
  const [message, setMessage] = useState("");

  async function createGame() {
    setMessage("");

    const res = await fetch("/api/games", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, width, height, movePointsPerTurn }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Could not create game.");
      return;
    }

    window.location.href = `/gm/${data.code}`;
  }

  return (
    <main className="min-h-screen bg-[url('/parchment-texture.png')] bg-amber-50 text-stone-900 p-8">
      <div className="mx-auto max-w-2xl rounded-3xl border-4 border-amber-900/30 bg-white/70 p-8 shadow-xl">
        <h1 className="text-4xl font-bold mb-4">Maze Master</h1>
        <p className="mb-6 text-stone-700">Create a new maze session.</p>

        <div className="space-y-4">
          <input
            className="w-full rounded-xl border border-stone-400 bg-white px-4 py-3"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Game name"
          />

          <div className="grid grid-cols-3 gap-4">
            <input
              type="number"
              min={10}
              max={100}
              className="rounded-xl border border-stone-400 bg-white px-4 py-3"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
            <input
              type="number"
              min={10}
              max={100}
              className="rounded-xl border border-stone-400 bg-white px-4 py-3"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
            <input
              type="number"
              min={1}
              className="rounded-xl border border-stone-400 bg-white px-4 py-3"
              value={movePointsPerTurn}
              onChange={(e) => setMovePointsPerTurn(Number(e.target.value))}
            />
          </div>

          <button
            onClick={createGame}
            className="rounded-xl bg-stone-800 px-5 py-3 text-white font-semibold"
          >
            Create game
          </button>

          {message && <p className="text-red-700">{message}</p>}
        </div>
      </div>
    </main>
  );
}