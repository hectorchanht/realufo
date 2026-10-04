import { SocialError, type Adapter } from "./common";
import { sendMedia, sendMessage, TgError } from "../tg";

// Telegram channel (spec 2026-10-04-realufo-telegram-gate-design): the bot posts as channel admin.
export const tg: Adapter = {
  needs: "any",
  vertical: true,
  configured: (env) => !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHANNEL),
  async publish(env, p) {
    const chat = env.TELEGRAM_CHANNEL!;
    try {
      const id = p.media ? await sendMedia(env, chat, p.media.key, p.text) : await sendMessage(env, chat, p.text);
      return { remoteId: String(id) };
    } catch (e) {
      if (e instanceof TgError) throw new SocialError(e.status, e.body);
      throw e;
    }
  },
};
