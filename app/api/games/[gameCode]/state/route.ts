import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeCells, normalizeWalls } from "@/lib/maze-visibility";
import { getParticipantMovePoints, normalizeMovePointMap, normalizeStringList } from "@/lib/turn-state";

type Participant = {
  id: string;
  name: string;
  kind: "player" | "npc";
  x: number | null;
  y: number | null;
  turn_order: number | null;
  remaining_moves: number;
  color?: string;
  move_points_per_turn?: number;
  has_ended_turn?: boolean;
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

    const participantColors =
      (game.map_data?.participantColors as Record<string, string> | undefined) ?? {};
    const participantMovePoints = normalizeMovePointMap(game.map_data?.participantMovePoints);
    const endedParticipantIds = normalizeStringList(game.map_data?.endedParticipantIds);
    const ordered = ((participants ?? []) as Participant[]).map((participant) => ({
      ...participant,
      color: participantColors[participant.id] ?? (participant.kind === "npc" ? "orange" : "red"),
      move_points_per_turn: getParticipantMovePoints(
        participant.id,
        game.move_points_per_turn,
        participantMovePoints
      ),
      has_ended_turn: endedParticipantIds.includes(participant.id),
    }));

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
      activeParticipantId: null,
      endedParticipantIds,
      activeTurnKind: game.is_npc_turn ? "npc" : "player",
    });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
