import { buildBot } from "./bot.js";
import { setDefaultCommands } from "./toolkit/index.js";
import { startScheduler } from "./scheduler.js";

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("BOT_TOKEN is required");
    process.exit(1);
  }
  const bot = await buildBot(token);
  await setDefaultCommands(bot);
  startScheduler(bot);
  bot.start();
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
