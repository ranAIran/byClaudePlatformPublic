// Points rules. XP only ever goes up; paperwork "boss" quests pay a bonus once.
export const XP = { perTask: 10, perStep: 10, bossBonus: 50 };

// Level n needs 100 + 50·(n−1) XP, so each level takes a bit longer than the last.
export function levelFor(xp) {
  let level = 1, rest = Math.max(0, Math.floor(xp)), need = 100;
  while (rest >= need) { rest -= need; level += 1; need = 100 + 50 * (level - 1); }
  return { level, into: rest, need };
}
