// Background scheduler — checks for due reminders every minute and sends
// notifications. Uses the injectable `now()` clock for testability.
// In production, started from src/index.ts after buildBot().

import { Bot } from "grammy";
import type { Ctx } from "./bot.js";
import { getEnabledReminders, updateReminder } from "./storage.js";
import { notifKeyboard, NOTIF_TEXT } from "./handlers/notifications.js";
import { now } from "./clock.js";

const CHECK_INTERVAL_MS = 60_000; // 1 minute

// ── Timezone helpers (uses Intl for real tz conversion) ──────────────────────

function getTzTime(tz: string, d: Date): { hh: number; mm: number; weekday: string } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    hh: parseInt(get("hour"), 10),
    mm: parseInt(get("minute"), 10),
    weekday: get("weekday").toLowerCase().slice(0, 3),
  };
}

// ── Core check ──────────────────────────────────────────────────────────────

export async function checkDueReminders(
  bot: Bot<Ctx>,
  currentTime?: Date,
): Promise<number> {
  const t = currentTime ?? now();
  const reminders = await getEnabledReminders();
  let fired = 0;

  for (const r of reminders) {
    try {
      // Check snoozed — fire if snoozedUntil has passed
      if (r.snoozedUntil && t.getTime() >= r.snoozedUntil) {
        await fireReminder(bot, r.id, r.userId, r.title);
        await updateReminder(r.id, { snoozedUntil: undefined, lastFired: t.getTime() });
        fired++;
        continue;
      }

      // Skip if snoozed in the future
      if (r.snoozedUntil) continue;

      // Get current time in the reminder's timezone
      const tzTime = getTzTime(r.timezone, t);
      const reminderTime = r.time.split(":");
      const rhh = parseInt(reminderTime[0], 10);
      const rmm = parseInt(reminderTime[1], 10);

      // Must match hour and minute
      if (tzTime.hh !== rhh || tzTime.mm !== rmm) continue;

      // For weekly, check weekday
      if (r.scheduleType === "weekly") {
        if (!r.weekdays?.includes(tzTime.weekday)) continue;
      }

      // Don't re-fire within the same minute
      if (r.lastFired) {
        const lastDate = new Date(r.lastFired);
        const diffMin = Math.abs(t.getTime() - lastDate.getTime()) / 60_000;
        if (diffMin < 1) continue;
      }

      await fireReminder(bot, r.id, r.userId, r.title);
      await updateReminder(r.id, { lastFired: t.getTime() });
      fired++;
    } catch (err) {
      // Don't let one failure abort the loop — log and continue
      console.error(`[scheduler] failed to fire reminder ${r.id}:`, err);
    }
  }

  return fired;
}

async function fireReminder(
  bot: Bot<Ctx>,
  reminderId: string,
  userId: number,
  title: string,
): Promise<void> {
  try {
    await bot.api.sendMessage(userId, NOTIF_TEXT(title), {
      parse_mode: "Markdown",
      reply_markup: notifKeyboard(reminderId),
    });
  } catch (err: unknown) {
    // 403 = user blocked bot — silently ignore
    const status = (err as { response?: { error_code?: number } })?.response?.error_code;
    if (status === 403) return;
    throw err;
  }
}

// ── Interval runner (production only) ───────────────────────────────────────

let intervalHandle: ReturnType<typeof setInterval> | undefined;

export function startScheduler(bot: Bot<Ctx>): void {
  if (intervalHandle) return;
  // Run once immediately, then every minute
  void checkDueReminders(bot);
  intervalHandle = setInterval(() => void checkDueReminders(bot), CHECK_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
}
