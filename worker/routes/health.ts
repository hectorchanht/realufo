import { json } from "../lib/json";

export const health = () => json({ ok: true, service: "realufo" });
