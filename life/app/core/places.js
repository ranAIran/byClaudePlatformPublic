// Suggests where a capture belongs: an island or a room. Keyword scoring, English and Hebrew.
// Rooms rank above their island when they match, so "fridge" goes to the kitchen, not just Home.

export const PLACE_WORDS = {
  paperwork: { en: ["passport", "bill", "tax", "taxes", "insurance", "renew", "license", "licence", "form", "bank", "invoice", "receipt", "visa", "id", "fine", "pension", "mortgage", "contract", "warranty", "electricity", "arnona"], he: ["דרכון", "חשבון", "חשבונית", "מס", "מיסים", "ביטוח", "רישיון", "טופס", "בנק", "קבלה", "ויזה", "תעודת", "קנס", "פנסיה", "משכנתא", "חוזה", "אחריות", "חשמל", "ארנונה", "לחדש", "ביטוח לאומי"] },
  health: { en: ["gym", "workout", "run", "running", "doctor", "dentist", "sleep", "yoga", "walk", "swim", "legs", "pills", "vitamins", "clinic", "checkup", "physio"], he: ["כושר", "אימון", "ריצה", "רופא", "רופאה", "רופא שיניים", "שינה", "יוגה", "הליכה", "שחייה", "כדורים", "ויטמינים", "קופת חולים", "בדיקה", "פיזיותרפיה"] },
  family: { en: ["mom", "mother", "dad", "father", "grandma", "grandpa", "kids", "son", "daughter", "birthday", "wife", "husband", "sister", "brother", "parents", "family", "anniversary"], he: ["אמא", "אבא", "סבתא", "סבא", "ילדים", "הבן", "הבת", "יום הולדת", "אשתי", "בעלי", "אחות", "אח", "הורים", "משפחה", "יום נישואין"] },
  work: { en: ["meeting", "project", "client", "report", "deadline", "boss", "team", "presentation", "office hours", "colleague", "standup", "review", "salary"], he: ["פגישה", "פרויקט", "לקוח", "דוח", "דדליין", "מנהל", "צוות", "מצגת", "עמית", "משכורת", "עבודה"] },
  kitchen: { en: ["fridge", "dishwasher", "groceries", "cook", "oven", "kitchen", "recipe", "milk", "bread", "coffee", "microwave"], he: ["מקרר", "מדיח", "קניות", "לבשל", "תנור", "מטבח", "מתכון", "חלב", "לחם", "קפה", "מיקרוגל"] },
  living: { en: ["tv", "sofa", "couch", "lamp", "living room", "plants", "netflix", "router"], he: ["טלוויזיה", "ספה", "מנורה", "סלון", "עציצים", "צמחים", "ראוטר"] },
  bedroom: { en: ["bed", "sheets", "closet", "wardrobe", "bedroom", "mattress", "pillow"], he: ["מיטה", "סדינים", "ארון", "חדר שינה", "מזרן", "כרית"] },
  office: { en: ["laptop", "printer", "desk", "backup", "computer", "monitor", "wifi", "wi-fi"], he: ["מחשב", "מדפסת", "שולחן עבודה", "גיבוי", "מסך"] },
  home: { en: ["repair", "clean", "plumber", "electrician", "rent", "paint", "laundry", "washing machine", "garden", "home", "house"], he: ["תיקון", "לנקות", "אינסטלטור", "חשמלאי", "שכירות", "צבע", "כביסה", "מכונת כביסה", "גינה", "בית"] },
};
const ORDER = ["paperwork", "health", "family", "work", "kitchen", "living", "bedroom", "office", "home"];
const WEIGHT = { bill: 2, passport: 2, tax: 2, insurance: 2, "חשבון": 2, "דרכון": 2, "ביטוח": 2 };

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const HE_PREFIXES = "ובלמהשכ";
// A Hebrew word matches as itself or with one attached prefix letter (לסבתא, בבנק, והחשבון);
// a phrase ("יום הולדת") matches as contained text. Plain containment would let "אח" match "אחריות".
function heMatch(words, t, w) {
  if (w.includes(" ")) return t.includes(w);
  return words.some((x) => x === w || (x.length === w.length + 1 && HE_PREFIXES.includes(x[0]) && x.slice(1) === w) || (x.length === w.length + 2 && HE_PREFIXES.includes(x[0]) && HE_PREFIXES.includes(x[1]) && x.slice(2) === w));
}

export function suggestPlaces(text) {
  const t = String(text || "").toLowerCase();
  const words = t.split(/[\s.,!?;:()"'״׳-]+/).filter(Boolean);
  const scores = {};
  for (const id of ORDER) {
    const { en, he } = PLACE_WORDS[id];
    let s = 0;
    for (const w of en) if (new RegExp(`(^|[^a-z])${esc(w)}(s)?([^a-z]|$)`).test(t)) s += WEIGHT[w] || 1;
    for (const w of he) if (heMatch(words, t, w)) s += WEIGHT[w] || 1;
    if (s) scores[id] = s;
  }
  const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a] || ORDER.indexOf(a) - ORDER.indexOf(b));
  for (const id of ["home", "paperwork", "work", "health", "family"]) if (!ranked.includes(id)) ranked.push(id);
  return ranked;
}
