// What celebration a finished thing earns (R26). Pure, so the feel itself is tested: bigger outcomes
// get bigger celebrations, and something that already paid out gets none.
const N = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G6: 1568 };

export function celebrationFor({ gained = 0, isStep = false, questDone = false, levelBefore = 1, levelAfter = 1 } = {}) {
  if (gained <= 0) return null;
  const levelUp = levelAfter > levelBefore ? levelAfter : null;
  const kind = questDone ? "quest" : isStep ? "step" : "task";
  let confetti = { step: 8, task: 28, quest: 90 }[kind];
  let notes = { step: [N.E5], task: [N.C5, N.G5], quest: [N.C5, N.E5, N.G5, N.C6] }[kind];
  if (levelUp) { confetti = 160; notes = [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6]; }
  return { kind, xp: gained, confetti, notes, levelUp };
}
