import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, mainMenuKeyboard } from "../toolkit/index.js";
import { getUserReminders, updateReminder, deleteReminder } from "../storage.js";
import type { Reminder } from "../storage.js";

const composer = new Composer<Ctx>();

const EMPTY = "No reminders yet — tap ➕ New to create one.";

composer.command("list", async (ctx) => {
  await showList(ctx);
});

composer.callbackQuery("list:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showList(ctx);
});

async function showList(ctx: Ctx) {
  const reminders = await getUserReminders(ctx.from!.id);

  if (reminders.length === 0) {
    await ctx.reply(EMPTY, { reply_markup: mainMenuKeyboard() });
    return;
  }

  await ctx.reply(formatList(reminders), {
    parse_mode: "Markdown",
    reply_markup: reminderListKeyboard(reminders),
  });
}

function formatList(reminders: Reminder[]): string {
  const lines = reminders.map((r, i) => {
    const status = r.enabled ? "🟢" : "⏸️";
    const days =
      r.scheduleType === "daily"
        ? "Daily"
        : (r.weekdays ?? []).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(", ");
    return `${status} *${i + 1}.* ${r.title}\n     ${days} at ${r.time}`;
  });
  return `📋 *Your reminders*\n\n${lines.join("\n\n")}`;
}

function reminderListKeyboard(reminders: Reminder[]) {
  const rows = reminders.map((r) => [
    inlineButton(
      r.enabled ? `⏸️ Pause` : `▶️ Resume`,
      `list:toggle:${r.id}`,
    ),
    inlineButton("🗑️ Delete", `list:del:${r.id}`),
  ]);
  rows.push([inlineButton("➕ New reminder", "new:start")]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  return inlineKeyboard(rows);
}

// ── Toggle enable/disable ───────────────────────────────────────────────────

composer.callbackQuery(/^list:toggle:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match![1];
  const r = await import("../storage.js").then((m) => m.getReminder(id));
  if (!r || r.userId !== ctx.from!.id) {
    await ctx.reply("Couldn't find that reminder.");
    return;
  }
  await updateReminder(id, { enabled: !r.enabled });
  const updated = { ...r, enabled: !r.enabled };

  // Re-render list
  const reminders = await getUserReminders(ctx.from!.id);
  await ctx.editMessageText(formatList(reminders), {
    parse_mode: "Markdown",
    reply_markup: reminderListKeyboard(reminders),
  });
});

// ── Delete (with confirmation) ──────────────────────────────────────────────

composer.callbackQuery(/^list:del:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match![1];
  const r = await import("../storage.js").then((m) => m.getReminder(id));
  if (!r || r.userId !== ctx.from!.id) {
    await ctx.reply("Couldn't find that reminder.");
    return;
  }

  await ctx.editMessageText(`Delete "${r.title}"?`, {
    reply_markup: inlineKeyboard([
      [inlineButton("Yes, delete", `list:delok:${id}`), inlineButton("Cancel", "list:show")],
    ]),
  });
});

composer.callbackQuery(/^list:delok:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match![1];
  await deleteReminder(id);

  const reminders = await getUserReminders(ctx.from!.id);
  if (reminders.length === 0) {
    await ctx.editMessageText("🗑️ Deleted. No reminders left — tap ➕ New to create one.", {
      reply_markup: mainMenuKeyboard(),
    });
  } else {
    await ctx.editMessageText("🗑️ Deleted.", {
      reply_markup: reminderListKeyboard(reminders),
    });
  }
});

export default composer;
