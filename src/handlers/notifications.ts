import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import {
  getReminder,
  updateReminder,
  addCompletion,
  getUser,
} from "../storage.js";

const composer = new Composer<Ctx>();

// ── Notification message — sent by the scheduler (handler tests will also
//    exercise these callbacks). The bot sends this text with buttons. ────────

export const NOTIF_TEXT = (title: string) => `⏰ *Reminder*\n\n${title}`;

export function notifKeyboard(reminderId: string) {
  return inlineKeyboard([
    [
      inlineButton("😴 Snooze 15m", `notif:snooze:${reminderId}:15:m`),
      inlineButton("😴 Snooze 1h", `notif:snooze:${reminderId}:1:h`),
    ],
    [inlineButton("✅ Done", `notif:done:${reminderId}`)],
  ]);
}

// ── Snooze ──────────────────────────────────────────────────────────────────

composer.callbackQuery(/^notif:snooze:(.+):(\d+):(m|h)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match![1];
  const duration = parseInt(ctx.match![2], 10);
  const unit = ctx.match![3] as "m" | "h";

  const r = await getReminder(id);
  if (!r || r.userId !== ctx.from!.id) {
    await ctx.reply("That reminder is no longer active.");
    return;
  }

  const ms = unit === "h" ? duration * 60 * 60 * 1000 : duration * 60 * 1000;
  const snoozedUntil = Date.now() + ms;
  await updateReminder(id, { snoozedUntil });

  const label = unit === "h" ? `${duration} hour(s)` : `${duration} min`;
  await ctx.editMessageText(`😴 Snoozed for ${label}. I'll remind you again then.`, {
    reply_markup: undefined,
  });
});

// ── Mark done ───────────────────────────────────────────────────────────────

composer.callbackQuery(/^notif:done:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match![1];

  const r = await getReminder(id);
  if (!r || r.userId !== ctx.from!.id) {
    await ctx.reply("That reminder is no longer active.");
    return;
  }

  await addCompletion(ctx.from!.id, id, r.title);

  // Clear snooze, schedule next occurrence
  await updateReminder(id, {
    snoozedUntil: undefined,
    lastFired: Date.now(),
  });

  await ctx.editMessageText("✅ Marked as done! Great job.", {
    reply_markup: undefined,
  });
});

export default composer;
