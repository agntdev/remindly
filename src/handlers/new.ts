import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  mainMenuKeyboard,
  confirmKeyboard,
} from "../toolkit/index.js";
import { getUser, saveUser, createReminder } from "../storage.js";
import { now } from "../clock.js";

// ── Session shape (ephemeral wizard state) ──────────────────────────────────
interface NewFlow {
  text?: string;
  scheduleType?: "daily" | "weekly";
  time?: string;
  weekdays?: string[];
  timezone?: string;
}

declare module "grammy" {
  interface Session {
    step?: string;
    newFlow?: NewFlow;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS: { label: string; val: string }[] = [
  { label: "Mon", val: "mon" },
  { label: "Tue", val: "tue" },
  { label: "Wed", val: "wed" },
  { label: "Thu", val: "thu" },
  { label: "Fri", val: "fri" },
  { label: "Sat", val: "sat" },
  { label: "Sun", val: "sun" },
];

function weekdayKeyboard(selected: string[]) {
  return inlineKeyboard([
    ...WEEKDAY_LABELS.map((d) => [
      inlineButton(
        selected.includes(d.val) ? `✅ ${d.label}` : d.label,
        `new:wd:${d.val}`,
      ),
    ]),
    [inlineButton("Done ✓", "new:wd:done")],
  ]);
}

function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

function scheduleLabel(r: { scheduleType: string; time: string; weekdays?: string[] }): string {
  const days = r.weekdays?.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(", ") ?? "";
  return r.scheduleType === "daily"
    ? `Daily at ${r.time}`
    : `${days} at ${r.time}`;
}

// ── Composer ─────────────────────────────────────────────────────────────────

const composer = new Composer<Ctx>();

// Entry — slash command or main-menu button
composer.command("new", async (ctx) => {
  await startNewFlow(ctx);
});

composer.callbackQuery("new:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await startNewFlow(ctx);
});

async function startNewFlow(ctx: Ctx) {
  ctx.session.step = "new:text";
  ctx.session.newFlow = {};
  await ctx.reply("What should I remind you about?", {
    reply_markup: { force_reply: true, input_field_placeholder: "Type your reminder…" },
  });
}

// ── Step: reminder text ─────────────────────────────────────────────────────

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "new:text") return next();

  const text = ctx.message.text.trim();
  if (text.length < 1 || text.length > 200) {
    await ctx.reply("Keep it short — up to 200 characters. Try again.");
    return;
  }

  ctx.session.newFlow!.text = text;
  ctx.session.step = "new:schedule";

  await ctx.reply("How often?", {
    reply_markup: inlineKeyboard([
      [inlineButton("🔄 Daily", "new:sched:daily"), inlineButton("📅 Weekly", "new:sched:weekly")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// ── Step: schedule type ─────────────────────────────────────────────────────

composer.callbackQuery("new:sched:daily", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.newFlow!.scheduleType = "daily";
  ctx.session.newFlow!.weekdays = undefined;
  await askTime(ctx);
});

composer.callbackQuery("new:sched:weekly", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.newFlow!.scheduleType = "weekly";
  ctx.session.newFlow!.weekdays = [];
  ctx.session.step = "new:weekdays";
  await ctx.editMessageText("Which days? Tap to select, then Done.", {
    reply_markup: weekdayKeyboard([]),
  });
});

// ── Step: weekdays (weekly only) ────────────────────────────────────────────

composer.callbackQuery(/^new:wd:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const val = ctx.match![1];
  if (val === "done") {
    if ((ctx.session.newFlow!.weekdays ?? []).length === 0) {
      await ctx.reply("Pick at least one day.");
      return;
    }
    await askTime(ctx);
    return;
  }
  const days = ctx.session.newFlow!.weekdays ?? [];
  if (days.includes(val)) {
    ctx.session.newFlow!.weekdays = days.filter((d) => d !== val);
  } else {
    days.push(val);
    ctx.session.newFlow!.weekdays = days;
  }
  await ctx.editMessageText("Which days? Tap to select, then Done.", {
    reply_markup: weekdayKeyboard(ctx.session.newFlow!.weekdays!),
  });
});

// ── Step: time ──────────────────────────────────────────────────────────────

async function askTime(ctx: Ctx) {
  ctx.session.step = "new:time";
  await ctx.reply("What time? (e.g. 09:00 or 14:30)", {
    reply_markup: { force_reply: true, input_field_placeholder: "HH:MM" },
  });
}

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "new:time") return next();

  const t = ctx.message.text.trim();
  if (!isValidTime(t)) {
    await ctx.reply("Please use 24h format like 09:00 or 14:30. Try again.");
    return;
  }

  ctx.session.newFlow!.time = t;

  // Resolve timezone — use stored pref or ask
  const user = await getUser(ctx.from!.id);
  const tz = user?.timezone;
  if (tz) {
    ctx.session.newFlow!.timezone = tz;
    await showConfirm(ctx);
  } else {
    ctx.session.step = "new:tz";
    await ctx.reply(
      "What's your timezone? (e.g. Europe/London, America/New_York)",
      {
        reply_markup: { force_reply: true, input_field_placeholder: "e.g. Europe/London" },
      },
    );
  }
});

// ── Step: timezone ──────────────────────────────────────────────────────────

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "new:tz") return next();

  const tz = ctx.message.text.trim();
  // Basic IANA tz validation — must contain a /
  if (!tz.includes("/")) {
    await ctx.reply("That doesn't look like a timezone. Use the format Region/City, e.g. Europe/London.");
    return;
  }

  // Save timezone preference
  const user = await getUser(ctx.from!.id);
  if (user) {
    user.timezone = tz;
    await saveUser(user);
  } else {
    await saveUser({ telegramId: ctx.from!.id, timezone: tz, snoozeDefaults: { duration: 15, unit: "m" } });
  }

  ctx.session.newFlow!.timezone = tz;
  await showConfirm(ctx);
});

// ── Step: confirm ───────────────────────────────────────────────────────────

async function showConfirm(ctx: Ctx) {
  ctx.session.step = "new:confirm";
  const f = ctx.session.newFlow!;
  const sched = scheduleLabel({ scheduleType: f.scheduleType!, time: f.time!, weekdays: f.weekdays });

  await ctx.reply(
    `📋 *Reminder*\n\n${f.text}\n\n⏰ ${sched}\n🌍 ${f.timezone}\n\nAll set?`,
    {
      parse_mode: "Markdown",
      reply_markup: confirmKeyboard("new:save", { yes: "✅ Save", no: "Cancel" }),
    },
  );
}

composer.callbackQuery("new:save:yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  const f = ctx.session.newFlow!;
  const tz = f.timezone ?? "UTC";

  await createReminder({
    userId: ctx.from!.id,
    title: f.text!,
    scheduleType: f.scheduleType!,
    time: f.time!,
    weekdays: f.weekdays,
    timezone: tz,
    enabled: true,
  });

  ctx.session.step = undefined;
  ctx.session.newFlow = undefined;

  await ctx.editMessageText("✅ Reminder saved! I'll notify you on schedule.", {
    reply_markup: mainMenuKeyboard(),
  });
});

composer.callbackQuery("new:save:no", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = undefined;
  ctx.session.newFlow = undefined;

  await ctx.editMessageText("👍 Cancelled. Tap a button below.", {
    reply_markup: mainMenuKeyboard(),
  });
});

export default composer;
