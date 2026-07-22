import { describe, it, expect } from "vitest";
import { relAgo, stanceOK } from "../lib/db";

describe("db", () => {
  describe("relAgo", () => {
    const formatSQLite = (date: Date): string => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    it("returns 'now' for missing or null input", () => {
      expect(relAgo(undefined)).toBe("now");
      expect(relAgo(null)).toBe("now");
    });

    it("returns 'now' for timestamps ≤3 seconds ago", () => {
      const now = new Date();
      const t1s = new Date(Date.now() - 1000);
      const t3s = new Date(Date.now() - 3000);
      expect(relAgo(t1s.toISOString())).toBe("now");
      expect(relAgo(t3s.toISOString())).toBe("now");
    });

    it("returns 'Ns' format for seconds < 60", () => {
      const t30s = new Date(Date.now() - 30000);
      const t59s = new Date(Date.now() - 59000);
      const iso30 = relAgo(t30s.toISOString());
      const iso59 = relAgo(t59s.toISOString());
      expect(iso30).toMatch(/^\d+s$/);
      expect(iso59).toMatch(/^\d+s$/);
    });

    it("returns '1m' for ~60 seconds", () => {
      const t60s = new Date(Date.now() - 60000);
      expect(relAgo(t60s.toISOString())).toBe("1m");
    });

    it("returns 'Nm' format for minutes < 60", () => {
      const t30m = new Date(Date.now() - 30 * 60000);
      const t59m = new Date(Date.now() - 59 * 60000);
      const iso30 = relAgo(t30m.toISOString());
      const iso59 = relAgo(t59m.toISOString());
      expect(iso30).toBe("30m");
      expect(iso59).toBe("59m");
    });

    it("returns '1h' for ~60 minutes", () => {
      const t60m = new Date(Date.now() - 60 * 60000);
      expect(relAgo(t60m.toISOString())).toBe("1h");
    });

    it("returns 'Nh' format for hours < 24", () => {
      const t12h = new Date(Date.now() - 12 * 60 * 60000);
      const t23h = new Date(Date.now() - 23 * 60 * 60000);
      expect(relAgo(t12h.toISOString())).toBe("12h");
      expect(relAgo(t23h.toISOString())).toBe("23h");
    });

    it("returns '1d' for ~24 hours", () => {
      const t24h = new Date(Date.now() - 24 * 60 * 60000);
      expect(relAgo(t24h.toISOString())).toBe("1d");
    });

    it("returns 'Nd' format for days", () => {
      const t7d = new Date(Date.now() - 7 * 24 * 60 * 60000);
      const t30d = new Date(Date.now() - 30 * 24 * 60 * 60000);
      expect(relAgo(t7d.toISOString())).toBe("7d");
      expect(relAgo(t30d.toISOString())).toBe("30d");
    });

    it("handles SQLite format (space-separated, no timezone)", () => {
      const t30s = new Date(Date.now() - 30000);
      const sqlite30 = formatSQLite(t30s);
      const result = relAgo(sqlite30);
      expect(result).toMatch(/^\d+s$/);
    });

    it("handles ISO 8601 format", () => {
      const t30s = new Date(Date.now() - 30000);
      const iso = t30s.toISOString();
      expect(relAgo(iso)).toMatch(/^\d+s$/);
    });
  });

  describe("stanceOK", () => {
    it("returns valid stances unchanged", () => {
      expect(stanceOK("neutral")).toBe("neutral");
      expect(stanceOK("believer")).toBe("believer");
      expect(stanceOK("skeptic")).toBe("skeptic");
      expect(stanceOK("analyst")).toBe("analyst");
    });

    it("returns 'neutral' for invalid stances", () => {
      expect(stanceOK("garbage")).toBe("neutral");
      expect(stanceOK("")).toBe("neutral");
      expect(stanceOK(undefined)).toBe("neutral");
      expect(stanceOK(42)).toBe("neutral");
    });

    it("coerces non-string values to string before validation", () => {
      // null becomes "null" → invalid → "neutral"
      expect(stanceOK(null)).toBe("neutral");
      // true becomes "true" → invalid → "neutral"
      expect(stanceOK(true)).toBe("neutral");
    });
  });
});
