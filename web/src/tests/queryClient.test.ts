import { expect, it } from "vitest";
import { makeQueryClient } from "../api/queryClient";

it("keeps query data fresh for 30s by default", () => {
  expect(makeQueryClient().getDefaultOptions().queries?.staleTime).toBe(30_000);
});
