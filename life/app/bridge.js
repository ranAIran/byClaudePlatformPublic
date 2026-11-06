// The only place that knows about Android. On the web, window.LifeAndroid does not exist and
// every call falls back to a web equivalent (Web Share, a file download, Web Speech).
// Native → web: Kotlin calls window.lifeBridge.onShare / onScanResult / onVoice / back.
export function initBridge({ onShare, onScan, onVoice, onBack, onError }) {
  const parse = (p) => (typeof p === "string" ? JSON.parse(p) : p);
  window.lifeBridge = {
    onShare: (p) => onShare(parse(p)),
    onScanResult: (p) => onScan(parse(p)),
    onVoice: (text) => onVoice(String(text || "")),
    back: () => (onBack() ? "true" : "false"),
    onScanError: (msg) => onError?.(msg),
    onError: (msg) => onError?.(msg),
  };
  const native = window.LifeAndroid || null;
  const api = {
    android: !!native,
    version: native?.version ? native.version() : null,
    canScan: !!native?.scanDocument,
    scan: () => native?.scanDocument(),
    canNativeVoice: !!native?.voiceInput,
    voice: (lang) => native?.voiceInput(lang),
    async shareText(title, text) {
      if (native?.shareText) return native.shareText(title, text);
      if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { /* cancelled */ } }
      try { await navigator.clipboard.writeText(text); return "copied"; } catch (e) { return "failed"; }
    },
    saveFile(name, mime, text) {
      if (native?.saveFile) return native.saveFile(name, mime, text);
      const url = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    openExternal(url) { if (native?.openExternal) native.openExternal(url); else window.open(url, "_blank", "noopener"); },
  };
  native?.ready?.(); // lets Kotlin deliver anything shared before the page finished loading
  return api;
}
