import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeCells, normalizeWalls } from "@/lib/maze-visibility";

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
  visible_to_participant_ids: string[];
  is_triggered: boolean;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const { searchParams } = new URL(request.url);
    const viewer = searchParams.get("viewer");
    const participantId = searchParams.get("participantId");

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, code, name, width, height, move_points_per_turn, status, current_turn_index, is_npc_turn, map_data")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const { data: participants, error: participantsError } = await supabaseAdmin
      .from("participants")
      .select("id, name, kind, x, y, turn_order, remaining_moves")
      .eq("game_id", game.id)
      .order("turn_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (participantsError) {
      return NextResponse.json({ error: participantsError.message }, { status: 500 });
    }

    const { data: traps, error: trapsError } = await supabaseAdmin
      .from("traps")
      .select("id, x, y, label, visibility_mode, visible_to_participant_ids, is_triggered")
      .eq("game_id", game.id)
      .order("created_at", { ascending: true });

    if (trapsError) {
      return NextResponse.json({ error: trapsError.message }, { status: 500 });
    }

    const ordered = (participants ?? []) as Participant[];
    const orderedPlayers = ordered.filter(
      (p) => p.kind === "player" && p.turn_order !== null
    );

    const activeParticipant =
      game.is_npc_turn ? null : orderedPlayers[game.current_turn_index] ?? null;

    const walls = normalizeWalls(game.map_data?.walls);
    const goals = normalizeCells(game.map_data?.goals);
    const allTraps = (traps ?? []) as Trap[];

    const visibleTraps =
      viewer === "gm"
        ? allTraps
        : allTraps.filter((trap) => {
            if (trap.is_triggered) return true;
            if (trap.visibility_mode === "public") return true;
            if (trap.visibility_mode === "selective" && participantId) {
              return trap.visible_to_participant_ids.includes(participantId);
            }
            return false;
          });

    return NextResponse.json({
      game,
      walls,
      goals: viewer === "gm" ? goals : [],
      traps: visibleTraps,
      participants: ordered,
      activeParticipantId: activeParticipant?.id ?? null,
      activeTurnKind: game.is_npc_turn ? "npc" : "player",
    });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
