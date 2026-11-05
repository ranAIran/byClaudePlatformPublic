// Narration with the Web Speech API.
// Hebrew text often contains English terms ("ה-Attention", "Byte"). Reading those with a
// Hebrew voice garbles them, so text is split into script runs and each run is spoken by a
// voice of its own language: Hebrew runs by a Hebrew voice, Latin runs by an English voice.
// The two languages are never mixed inside one utterance.

const HEB = /[֐-׿]/;
const LAT = /[A-Za-z]/;
// Hebrew one-letter prefixes glued to an English word ("ה-Gate") are spoken with vowel marks,
// so the Hebrew voice says "ha", "le", "be"... instead of the letter's name.
const PREFIX = { "ה": "הַ", "ו": "וְ", "ב": "בְּ", "ל": "לְ", "מ": "מִ", "ש": "שֶׁ", "כ": "כְּ" };

export function segments(text) {
  const runs = [];
  let cur = null;
  for (const ch of String(text)) {
    const script = HEB.test(ch) ? "he" : LAT.test(ch) ? "en" : null;
    if (script && (!cur || cur.lang !== script)) { cur = { lang: script, text: "" }; runs.push(cur); }
    if (cur) cur.text += ch; else { cur = { lang: null, text: ch }; runs.push(cur); }
  }
  // Neutral leading text (digits, punctuation) joins the next run.
  if (runs.length > 1 && runs[0].lang === null) { runs[1].text = runs[0].text + runs[1].text; runs.shift(); }
  for (const r of runs) {
    if (r.lang === "he") {
      const m = r.text.match(/^(.*?)(?:^|\s)([הובלמשכ])-\s*$/s);
      if (m) r.text = m[1] + " " + PREFIX[m[2]];
      r.text = r.text.replace(/-\s*$/, " ");
      r.text = r.text.replace(/(^|\s)([הובלמשכ])-(?=\d)/g, (_, a, b) => a + PREFIX[b] + " ");
    }
  }
  return runs.filter((r) => r.lang && /[\p{L}\p{N}]/u.test(r.text)).map((r) => ({ lang: r.lang, text: r.text.trim() }));
}

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
let voices = [];
function loadVoices() { voices = synth ? synth.getVoices() : []; }
if (synth) { loadVoices(); synth.addEventListener?.("voiceschanged", loadVoices); }

function pickVoice(lang) {
  const want = lang === "he" ? ["he", "iw"] : ["en"];
  const list = voices.filter((v) => want.some((w) => v.lang.toLowerCase().startsWith(w)));
  if (lang === "en") return list.find((v) => /en[-_]US/i.test(v.lang) && v.localService) || list.find((v) => /en[-_]US/i.test(v.lang)) || list[0] || null;
  return list.find((v) => v.localService) || list[0] || null;
}

export const speech = {
  supported: !!synth,
  speaking: false,
  onchange: null,
  hasVoice(lang) { loadVoices(); return !!pickVoice(lang); },
  stop() {
    if (!synth) return;
    synth.cancel();
    this.speaking = false; this.onchange?.(false);
  },
  // Speak text in the game's current language. Hebrew text is split into Hebrew and English runs.
  speak(text, lang) {
    if (!synth || !text) return;
    synth.cancel();
    loadVoices();
    const runs = lang === "he" ? segments(text) : [{ lang: "en", text: String(text) }];
    if (!runs.length) return;
    this.speaking = true; this.onchange?.(true);
    runs.forEach((r, i) => {
      const u = new SpeechSynthesisUtterance(r.text);
      u.lang = r.lang === "he" ? "he-IL" : "en-US";
      const v = pickVoice(r.lang);
      if (v) u.voice = v;
      u.rate = r.lang === "he" ? 1.0 : 0.95;
      if (i === runs.length - 1) u.onend = u.onerror = () => { this.speaking = false; this.onchange?.(false); };
      synth.speak(u);
    });
  },
};
