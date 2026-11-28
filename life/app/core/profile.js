// The user profile, "memory" (R52): the owner's week, rest and effective times, places, people.
// Each value keeps who set it (you, learned, default), when, and every earlier value.
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const days = (d) => Array.isArray(d) && d.length > 0 && d.every((x) => Number.isInteger(x) && x >= 0 && x <= 6) && new Set(d).size === d.length;
const range = (r) => r && typeof r === "object" && days(r.days) && TIME.test(r.from) && TIME.test(r.to) && r.from < r.to && (r.label === undefined || typeof r.label === "string");
const ranges = (v) => Array.isArray(v) && v.every(range);

export const PROFILE_KEYS = ["workWeek", "restTimes", "focusTimes", "lowTimes", "errands", "placeHours", "people"];
// Sunday–Thursday 09:00–17:00 is the usual Israeli week; everything else starts empty.
export const DEFAULT_PROFILE = {
  workWeek: { days: [0, 1, 2, 3, 4], from: "09:00", to: "17:00" },
  restTimes: [], focusTimes: [], lowTimes: [],
  errands: { friday: true, saturday: false },
  placeHours: {}, people: [],
};
const CHECK = {
  workWeek: range,
  restTimes: ranges, focusTimes: ranges, lowTimes: ranges,
  errands: (v) => v && typeof v.friday === "boolean" && typeof v.saturday === "boolean",
  placeHours: (v) => v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(ranges),
  people: (v) => Array.isArray(v) && v.every((p) => p && typeof p.name === "string" && p.name.trim() && (p.note === undefined || typeof p.note === "string")),
};
export const validProfile = (key, value) => !!CHECK[key] && !!CHECK[key](value);
