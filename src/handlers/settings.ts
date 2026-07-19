import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, mainMenuKeyboard } from "../toolkit/index.js";
import { getUser, saveUser } from "../storage.js";

const composer = new Composer<Ctx>();

const SNOOZE_OPTIONS = [
  { label: "5 min", data: "settings:snooze:5:m" },
  { label: "15 min", data: "settings:snooze:15:m" },
  { label: "30 min", data: "settings:snooze:30:m" },
  { label: "1 hour", data: "settings:snooze:1:h" },
  { label: "2 hours", data: "settings:snooze:2:h" },
];

composer.command("settings", async (ctx) => {
  await showSettings(ctx);
});

composer.callbackQuery("settings:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSettings(ctx);
});

async function showSettings(ctx: Ctx) {
  const user = await getUser(ctx.from!.id);
  const tz = user?.timezone ?? "UTC";
  const snooze = user?.snoozeDefaults
    ? `${user.snoozeDefaults.duration} ${user.snoozeDefaults.unit === "h" ? "hour(s)" : "min"}`
    : "15 min";

  const text =
    "⚙️ *Settings*\n\n" +
    `🌍 Timezone: *${tz}*\n` +
    `😴 Default snooze: *${snooze}*`;

  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: inlineKeyboard([
      [inlineButton("🌍 Change timezone", "settings:tz")],
      [inlineButton("😴 Change snooze", "settings:snooze")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
}

// ── Change timezone ─────────────────────────────────────────────────────────

composer.callbackQuery("settings:tz", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "settings:tz";
  await ctx.editMessageText("🌍 What's your timezone?\n\nType it below, like Europe/London or America/New_York.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "settings:tz") return next();

  const tz = ctx.message.text.trim();
  if (!tz.includes("/")) {
    await ctx.reply("That doesn't look like a timezone. Use Region/City format, e.g. Europe/London.");
    return;
  }

  const user = await getUser(ctx.from!.id);
  if (user) {
    user.timezone = tz;
    await saveUser(user);
  } else {
    await saveUser({ telegramId: ctx.from!.id, timezone: tz, snoozeDefaults: { duration: 15, unit: "m" } });
  }

  ctx.session.step = undefined;
  await ctx.reply(`✅ Timezone updated to *${tz}*`, {
    parse_mode: "Markdown",
    reply_markup: mainMenuKeyboard(),
  });
});

// ── Change snooze defaults ──────────────────────────────────────────────────

composer.callbackQuery("settings:snooze", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("😴 How long should snooze last?", {
    reply_markup: inlineKeyboard([
      SNOOZE_OPTIONS.map((o) => inlineButton(o.label, o.data)),
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery(/^settings:snooze:(\d+):(m|h)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const duration = parseInt(ctx.match![1], 10);
  const unit = ctx.match![2] as "m" | "h";

  const user = await getUser(ctx.from!.id);
  if (user) {
    user.snoozeDefaults = { duration, unit };
    await saveUser(user);
  } else {
    await saveUser({ telegramId: ctx.from!.id, timezone: "UTC", snoozeDefaults: { duration, unit } });
  }

  const label = unit === "h" ? `${duration} hour(s)` : `${duration} min`;
  await ctx.editMessageText(`✅ Snooze default set to *${label}*`, {
    parse_mode: "Markdown",
    reply_markup: mainMenuKeyboard(),
  });
});

export default composer;
