export function generateGameCode() {
  const words1 = ["oak", "mist", "wolf", "ember", "rune", "thorn"];
  const words2 = ["moon", "hall", "keep", "cave", "path", "gate"];

  const a = words1[Math.floor(Math.random() * words1.length)];
  const b = words2[Math.floor(Math.random() * words2.length)];
  const n = Math.floor(10 + Math.random() * 90);

  return `${a}-${b}-${n}`;
}

export function isAdjacent(fromX: number, fromY: number, toX: number, toY: number) {
  const dx = Math.abs(fromX - toX);
  const dy = Math.abs(fromY - toY);
  return dx + dy === 1;
}