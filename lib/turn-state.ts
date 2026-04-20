export function normalizeStringList(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input.filter((item): item is string => typeof item === "string");
}

export function normalizeMovePointMap(input: unknown) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }

  const entries = Object.entries(input as Record<string, unknown>)
    .filter(([, value]) => Number.isInteger(value) && Number(value) >= 0)
    .map(([key, value]) => [key, Number(value)] as const);

  return Object.fromEntries(entries);
}

export function getParticipantMovePoints(
  participantId: string,
  defaultMovePoints: number,
  participantMovePoints: Record<string, number>
) {
  return participantMovePoints[participantId] ?? defaultMovePoints;
}
