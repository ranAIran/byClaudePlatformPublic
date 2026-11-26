// Celebrations (R26): confetti, "+XP" flying to the bar, a short chime and a level-up moment.
// The app decides what to celebrate (core/reward.js); this file only plays it.
const COLORS = ["#ffc94d", "#ff9f1c", "#ff7a6b", "#5fe09a", "#6aa9ff", "#ff9fd0", "#fff3d6"];
const STAR = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 2l3 7 7 .6-5.3 4.6 1.6 7L12 17.6 5.7 21.2l1.6-7L2 9.6 9 9z"/></svg>`;
const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function createFx({ xpBar, levelBadge, soundOn = () => true, text = (k, v) => ({ levelUp: "Level up!", reachedLevel: `You reached level ${v?.n}`, questComplete: "Quest complete!" })[k] }) {
  // ----- confetti on one full-screen canvas; the loop only runs while pieces are in the air -----
  const canvas = document.createElement("canvas"); canvas.id = "fx"; canvas.setAttribute("aria-hidden", "true"); document.body.append(canvas);
  const g = canvas.getContext("2d"); let parts = [], raf = 0, lastT = 0, last = null;
  const size = () => { const d = Math.min(2, window.devicePixelRatio || 1); canvas.width = innerWidth * d; canvas.height = innerHeight * d; g.setTransform(d, 0, 0, d, 0, 0); };
  size(); window.addEventListener("resize", size);
  function frame(t) {
    const dt = Math.min(0.1, (t - lastT) / 1000 || 0.016); lastT = t; // real time, so confetti never lingers on a slow device
    g.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
    for (const p of parts) {
      p.vy += 950 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, p.life * 2.5); g.fillStyle = p.c;
      if (p.round) { g.beginPath(); g.arc(0, 0, p.w / 2, 0, 6.283); g.fill(); }
      else { const flip = Math.cos(p.rot * 2.3); g.fillRect(-p.w / 2, (-p.h / 2) * flip, p.w, p.h * flip); }
      g.restore();
    }
    raf = parts.length ? requestAnimationFrame(frame) : 0;
  }
  function burst(x, y, n, { spread = 1.9, power = 430 } = {}) {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * spread, v = power * (0.35 + Math.random() * 0.75);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, c: COLORS[(Math.random() * COLORS.length) | 0], round: Math.random() < 0.25, life: 1.1 + Math.random() * 0.9 });
    }
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
  }

  // ----- "+10 XP" lifts off the thing you finished and lands on the XP bar -----
  function flyXp(from, xp) {
    const el = document.createElement("div"); el.className = "xpfly"; el.innerHTML = `${STAR}+${xp} XP`; document.body.append(el);
    const sx = from.left + from.width / 2, sy = from.top + from.height / 2;
    const tb = xpBar.getBoundingClientRect(), dx = tb.right - sx, dy = tb.top + tb.height / 2 - sy;
    el.style.left = sx + "px"; el.style.top = sy + "px";
    const end = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const a = el.animate([
      { transform: "translate(-50%,-50%) scale(.5)", opacity: 0 },
      { transform: "translate(-50%,-150%) scale(1.15)", opacity: 1, offset: 0.16 },
      { transform: "translate(-50%,-175%) scale(1)", opacity: 1, offset: 0.42 },
      { transform: `${end} scale(.55)`, opacity: 0.95, offset: 0.94 },
      { transform: `${end} scale(.2)`, opacity: 0 },
    ], { duration: reduced() ? 600 : 1100, easing: "cubic-bezier(.3,.1,.2,1)" });
    a.onfinish = () => { el.remove(); pulse(); };
  }
  function pulse() {
    xpBar.parentElement.animate([{ boxShadow: "0 0 0 0 rgba(255,201,77,.9)" }, { boxShadow: "0 0 0 9px rgba(255,201,77,0)" }], { duration: 520 });
    levelBadge.animate([{ transform: "scale(1)" }, { transform: "scale(1.2)" }, { transform: "scale(1)" }], { duration: 380, easing: "ease-out" });
  }

  // ----- a soft chime: one note per reward size, played as a quick rising run -----
  let ac = null;
  function chime(notes) {
    if (!soundOn() || !notes?.length) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume();
      const t0 = ac.currentTime + 0.02, master = ac.createGain(); master.gain.value = 0.16; master.connect(ac.destination);
      notes.forEach((f, i) => {
        const t = t0 + i * 0.085, o = ac.createOscillator(), o2 = ac.createOscillator(), env = ac.createGain(), soft = ac.createGain();
        o.type = "triangle"; o.frequency.value = f; o2.type = "sine"; o2.frequency.value = f * 2; soft.gain.value = 0.25;
        env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(1, t + 0.012); env.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        o.connect(env); o2.connect(soft); soft.connect(env); env.connect(master);
        o.start(t); o2.start(t); o.stop(t + 0.46); o2.stop(t + 0.46);
      });
    } catch (e) { /* no audio on this device */ }
  }

  // ----- the big moments -----
  function banner(title, sub) {
    document.getElementById("banner")?.remove();
    const el = document.createElement("div"); el.id = "banner"; el.setAttribute("role", "status");
    el.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8"/></svg><div><b></b><span></span></div>`;
    el.querySelector("b").textContent = title; el.querySelector("span").textContent = sub; document.body.append(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, 2600);
  }
  function levelUp(n, pieces) {
    document.getElementById("levelUp")?.remove();
    const el = document.createElement("div"); el.id = "levelUp"; el.setAttribute("role", "status");
    el.innerHTML = `<div class="rays"></div><div class="lu-card"><div class="lu-badge">${n}</div><b>${text("levelUp")}</b><span>${text("reachedLevel", { n })}</span></div>`;
    document.body.append(el);
    const close = () => { if (el.classList.contains("out")) return; el.classList.add("out"); setTimeout(() => el.remove(), 300); };
    el.addEventListener("click", close); setTimeout(close, 3000);
    burst(innerWidth / 2, innerHeight * 0.42, Math.round(pieces * 0.6), { spread: Math.PI * 1.6, power: 720 });
    setTimeout(() => burst(innerWidth * 0.18, innerHeight * 0.55, Math.round(pieces * 0.2), { spread: 1.2, power: 620 }), 220);
    setTimeout(() => burst(innerWidth * 0.82, innerHeight * 0.55, Math.round(pieces * 0.2), { spread: 1.2, power: 620 }), 380);
  }

  // c comes from celebrationFor(); from is the rectangle of the thing that was finished.
  function play(c, from, { title = "" } = {}) {
    last = c; if (!c) return;
    const x = from.left + from.width / 2, y = from.top + from.height / 2;
    flyXp(from, c.xp); chime(c.notes);
    try { navigator.vibrate?.(c.levelUp ? [25, 50, 25, 50, 40] : c.kind === "quest" ? [20, 40, 30] : c.kind === "step" ? 10 : 18); } catch (e) { /* not allowed */ }
    if (c.levelUp) { burst(x, y, 20); setTimeout(() => levelUp(c.levelUp, c.confetti), 450); }
    else burst(x, y, c.confetti, c.kind === "quest" ? { spread: Math.PI * 1.3, power: 680 } : undefined);
    if (c.kind === "quest") banner(text("questComplete"), `${title} · +${c.xp} XP`);
  }
  return { play, burst, chime, banner, confetti: () => parts.length, last: () => last };
}
