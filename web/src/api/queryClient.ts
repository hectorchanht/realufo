import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

/** 4xx won't change on retry (a missing file stays missing); network/5xx get 2 retries. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });
}
