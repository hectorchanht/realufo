// worker/lib/tgcmd.ts
import type { Env } from "../env";
import { sendMessage } from "./tg";
export async function command(env: Env, _m: any) {
  await sendMessage(env, env.TELEGRAM_OWNER_ID!, "Commands arrive in the next update.");
}
