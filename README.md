# Driftlight

A 60-second WebGPU arcade game in one `index.html`, with no build step and no dependencies.

Steer a glowing orb through 50,000 drifting lights. Your orb pulls in lights of its own colour and pushes the other colours away. Dark lights shrink it. Keep eating without getting hit to raise your score multiplier (up to ×5).

## Controls

| Action | Desktop | Phone |
|---|---|---|
| Move | Mouse | Drag (the orb sits just above your finger) |
| Switch colour | Click, `Space`, or `1` / `2` / `3` | Tap |

## Play it

Driftlight needs a browser with WebGPU: Chrome or Edge 113+, or Safari 18+.

- **Locally:** open `index.html` in the browser.
- **GitHub Pages:** in the repo, go to *Settings → Pages*, set *Source* to *Deploy from a branch*, then pick the branch and `/ (root)`.

Add `?shot` to the URL for a frozen, HUD-free frame, which is useful for making a thumbnail.

## How it works

- **Compute pass:** moves every particle through a flow field, then handles attraction, repulsion and eating. It counts score and damage with `atomicAdd`.
- **Render pass:** draws the background, the particles as instanced glow quads with premultiplied blending (dark lights cover what's behind them, coloured lights add to it), and the orb.
- **Readback:** the score and damage counters are copied into a ring of three mappable buffers and read one frame late, so the CPU never waits on the GPU.
