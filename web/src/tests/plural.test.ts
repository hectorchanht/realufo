import { describe, it, expect } from "vitest";
import { plural } from "../lib/plural";

describe("plural", () => {
  it("singular for 1, plural otherwise, grouped digits", () => {
    expect(plural(0, "comment")).toBe("0 comments");
    expect(plural(1, "comment")).toBe("1 comment");
    expect(plural(1200, "thread")).toBe("1,200 threads");
  });
});
