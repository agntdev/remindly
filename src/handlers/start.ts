import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
import { registerMainMenuItem } from "../toolkit/index.js";

// Register main-menu buttons (order controls display position).
registerMainMenuItem({ label: "➕ New reminder", data: "new:start", order: 10 });
registerMainMenuItem({ label: "📋 My reminders", data: "list:show", order: 20 });
registerMainMenuItem({ label: "⚙️ Settings", data: "settings:show", order: 30 });

const composer = new Composer<Ctx>();

const WELCOME = "👋 Welcome! Tap a button below to get started.";

composer.command("start", async (ctx) => {
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
