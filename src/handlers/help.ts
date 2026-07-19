import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

const HELP =
  "💡 *How this bot works*\n\n" +
  "I send you private reminders on a schedule you pick.\n\n" +
  "• *Create* — tap ➕ New in the menu\n" +
  "• *Manage* — tap 📋 My reminders\n" +
  "• *Settings* — tap ⚙️ for timezone & snooze\n\n" +
  "When a reminder fires, tap *Snooze* to delay or *Done* to mark it complete.";

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.command("help", async (ctx) => {
  await ctx.reply(HELP, { parse_mode: "Markdown" });
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HELP, { parse_mode: "Markdown", reply_markup: backToMenu });
});

export default composer;
