// Graphics quality (R39). Computers get "enhanced" by default and can switch back to "light" in the
// menu; phones and tablets (a coarse pointer) always stay "light", whatever was saved.
export function pickQuality({ coarse = false, width = 0, saved = null } = {}) {
  if (coarse) return "light";
  if (saved === "light" || saved === "enhanced") return saved;
  return width >= 900 ? "enhanced" : "light";
}
export const canChooseQuality = ({ coarse = false } = {}) => !coarse;
