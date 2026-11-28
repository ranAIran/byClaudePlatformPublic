// R56 · the Life Archipelago app icon (option A, the city island at golden hour): an adaptive icon
// for Android in every density, and the same art as the website's icon. The quest keeps its own.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const size = (f) => { const b = readFileSync(f); expect(b.subarray(1, 4).toString()).toBe("PNG"); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const D = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

describe("R56 · the app icon", () => {
  it("Android: an adaptive icon (background + foreground) in the Life flavour, every density", () => {
    const xml = readFileSync(join(root, "android/app/src/life/res/mipmap-anydpi-v26/ic_launcher.xml"), "utf8");
    expect(xml).toContain("<adaptive-icon"); expect(xml).toContain("@mipmap/ic_launcher_background"); expect(xml).toContain("@mipmap/ic_launcher_foreground");
    for (const [d, k] of Object.entries(D)) {
      const dir = join(root, `android/app/src/life/res/mipmap-${d}`);
      expect(size(join(dir, "ic_launcher_foreground.png"))).toEqual([108 * k, 108 * k]);
      expect(size(join(dir, "ic_launcher_background.png"))).toEqual([108 * k, 108 * k]);
      expect(size(join(dir, "ic_launcher.png"))).toEqual([48 * k, 48 * k]);
    }
  });
  it("the quest app keeps its own icon", () => {
    expect(existsSync(join(root, "android/app/src/quest/res/mipmap-xxxhdpi/ic_launcher.png"))).toBe(true);
    expect(existsSync(join(root, "android/app/src/quest/res/mipmap-anydpi-v26/ic_launcher.xml"))).toBe(false);
  });
  it("the website uses the same icon", () => {
    const html = readFileSync(join(root, "app/index.html"), "utf8");
    expect(html).toContain('href="icons/favicon-32.png"'); expect(html).toContain('rel="apple-touch-icon" href="icons/icon-180.png"');
    expect(size(join(root, "app/icons/favicon-32.png"))).toEqual([32, 32]); expect(size(join(root, "app/icons/icon-180.png"))).toEqual([180, 180]); expect(size(join(root, "app/icons/icon-512.png"))).toEqual([512, 512]);
    expect(readFileSync(join(root, "app/icons/icon.svg"), "utf8")).toContain("<svg");
  });
  it("installing the website as an app uses the same icon (web app manifest)", () => {
    const html = readFileSync(join(root, "app/index.html"), "utf8");
    expect(html).toContain('<link rel="manifest" href="manifest.webmanifest">');
    const m = JSON.parse(readFileSync(join(root, "app/manifest.webmanifest"), "utf8"));
    expect(m).toMatchObject({ name: "Life Archipelago", display: "standalone", start_url: "./" });
    const icons = Object.fromEntries(m.icons.map((i) => [i.sizes + " " + (i.purpose || "any"), i.src]));
    expect(icons["192x192 any"]).toBe("icons/icon-192.png"); expect(icons["512x512 any"]).toBe("icons/icon-512.png"); expect(icons["512x512 maskable"]).toBe("icons/icon-512.png");
    expect(size(join(root, "app/icons/icon-192.png"))).toEqual([192, 192]);
  });
});
