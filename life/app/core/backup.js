// Automatic backups (R20): one file a day, named by date. The phone keeps the last 14 (Kotlin).
import { isoDate } from "./capture.js";
export const backupDue = (lastIso, now = new Date()) => !lastIso || lastIso < isoDate(now);
export const backupName = (now = new Date()) => `life-backup-${isoDate(now)}.json`;
// On the web there is no folder to write to: remind to export once a month.
export const exportReminderDue = (lastIso, now = new Date()) => !lastIso || (now - new Date(lastIso + "T00:00:00")) / 864e5 >= 30;
