// TanStack Query hooks — the ONLY place screens should reach for data. Screens import
// these + api/types, never call `fetch`/`api` directly (see FRONTEND-CONTEXT.md).
//
// Query key convention: `[resource]` or `[resource, id-or-params]`, exported as `qk` so
// mutations can target exactly the caches they touch when invalidating.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AddCommentResponse,
  BoardThreadsResponse,
  Bootstrap,
  CaseDetail,
  Comment,
  CommentsResponse,
  CreatePostResponse,
  CreateThreadResponse,
  Feed,
  RecordDetail,
  RecordsListResponse,
  Stance,
  ThreadDetail,
  VoteResult,
  VoteTargetType,
} from "./types";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export interface RecordsParams {
  archive?: string;
  type?: string;
  redacted?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export const qk = {
  bootstrap: ["bootstrap"] as const,
  feed: ["feed"] as const,
  records: (params: RecordsParams = {}) => ["records", params] as const,
  record: (id: string) => ["record", id] as const,
  comments: (recordId: string) => ["comments", recordId] as const,
  boardThreads: (boardId: string) => ["boardThreads", boardId] as const,
  thread: (id: string) => ["thread", id] as const,
  case: (slug: string) => ["case", slug] as const,
  caseComments: (slug: string) => ["caseComments", slug] as const,
};

function recordsPath(params: RecordsParams): string {
  const usp = new URLSearchParams();
  if (params.archive) usp.set("archive", params.archive);
  if (params.type) usp.set("type", params.type);
  if (params.redacted) usp.set("redacted", "1");
  if (params.q) usp.set("q", params.q);
  if (params.limit != null) usp.set("limit", String(params.limit));
  if (params.offset != null) usp.set("offset", String(params.offset));
  const qs = usp.toString();
  return qs ? `/api/records?${qs}` : "/api/records";
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useBootstrap() {
  return useQuery({
    queryKey: qk.bootstrap,
    queryFn: () => api.get<Bootstrap>("/api/bootstrap"),
  });
}

export function useFeed() {
  return useQuery({
    queryKey: qk.feed,
    queryFn: () => api.get<Feed>("/api/feed"),
  });
}

export function useRecords(params: RecordsParams = {}) {
  return useQuery({
    queryKey: qk.records(params),
    queryFn: () => api.get<RecordsListResponse>(recordsPath(params)),
  });
}

export function useRecord(id: string) {
  return useQuery({
    queryKey: qk.record(id),
    queryFn: () => api.get<RecordDetail>(`/api/records/${id}`),
    enabled: !!id,
  });
}

export function useComments(recordId: string) {
  return useQuery({
    queryKey: qk.comments(recordId),
    queryFn: () => api.get<CommentsResponse>(`/api/records/${recordId}/comments`),
    enabled: !!recordId,
  });
}

export function useBoardThreads(boardId: string) {
  return useQuery({
    queryKey: qk.boardThreads(boardId),
    queryFn: () => api.get<BoardThreadsResponse>(`/api/boards/${boardId}/threads`),
    enabled: !!boardId,
  });
}

export function useThread(id: string) {
  return useQuery({
    queryKey: qk.thread(id),
    queryFn: () => api.get<ThreadDetail>(`/api/threads/${id}`),
    enabled: !!id,
  });
}

export function useCase(slug: string) {
  return useQuery({
    queryKey: qk.case(slug),
    queryFn: () => api.get<CaseDetail>(`/api/cases/${slug}`),
    enabled: !!slug,
  });
}

export function useCaseComments(slug: string) {
  return useQuery({
    queryKey: qk.caseComments(slug),
    queryFn: () => api.get<CommentsResponse>(`/api/cases/${slug}/comments`),
    enabled: !!slug,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useAddComment(recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { body: string; stance?: Stance; handle?: string }) =>
      api.post<AddCommentResponse>(`/api/records/${recordId}/comments`, vars),
    onSuccess: (data) => {
      queryClient.setQueryData<CommentsResponse>(qk.comments(recordId), (old) => ({
        comments: [data.comment, ...(old?.comments ?? [])],
      }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.comments(recordId) });
      void queryClient.invalidateQueries({ queryKey: qk.record(recordId) });
    },
  });
}

export function useAddCaseComment(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { body: string; stance?: Stance; handle?: string }) =>
      api.post<AddCommentResponse>(`/api/cases/${slug}/comments`, vars),
    onSuccess: (data) => {
      queryClient.setQueryData<CommentsResponse>(qk.caseComments(slug), (old) => ({
        comments: [data.comment, ...(old?.comments ?? [])],
      }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.caseComments(slug) });
    },
  });
}

export function useCreateThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      board: string;
      title?: string;
      op_body: string;
      stance?: Stance;
      handle?: string;
      source_record_id?: string;
      case_slug?: string;
    }) => api.post<CreateThreadResponse>("/api/threads", vars),
    onSettled: (data, _err, vars) => {
      void queryClient.invalidateQueries({ queryKey: qk.feed });
      if (data) {
        void queryClient.invalidateQueries({ queryKey: qk.boardThreads(data.thread.board_id) });
      }
      if (vars.case_slug) void queryClient.invalidateQueries({ queryKey: qk.case(vars.case_slug) });
    },
  });
}

export function useReply(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      body: string;
      stance?: Stance;
      handle?: string;
      source_record_id?: string;
      image_label?: string;
    }) => api.post<CreatePostResponse>(`/api/threads/${threadId}/posts`, vars),
    onSuccess: (data) => {
      queryClient.setQueryData<ThreadDetail>(qk.thread(threadId), (old) =>
        old
          ? {
              ...old,
              posts: [...old.posts, data.post],
              thread: { ...old.thread, reply_count: old.thread.reply_count + 1 },
            }
          : old,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.thread(threadId) });
    },
  });
}

// ---------------------------------------------------------------------------
// useVote — optimistic vote toggle.
//
// Vote counts live denormalized on whatever cached object currently displays them
// (a ThreadCard/ThreadFull, a Post, a Comment, or a PromotedThread — all of which carry
// `{id, votes}`), possibly nested several levels deep inside a query's cached payload
// (e.g. `thread.posts[i]`, `feed.hot[i]`, `record.promotedThreads[i]`). Rather than hand
// -enumerate every shape, `patchVotesDeep` walks a cached value and rewrites the node
// whose `id` matches, leaving everything else referentially untouched (so components
// watching unrelated data don't re-render).
//
// The API is a plain toggle (`{voted, votes}`) with no server-tracked "did *I* vote"
// exposed anywhere except that response, so the "have I voted" flip direction is tracked
// client-side in localStorage (`ufo_voted`) — populated from each vote response and read
// back before the next optimistic flip on the same target.
// ---------------------------------------------------------------------------

interface VotableEntity {
  id: string;
  votes: number;
}

function isVotable(x: unknown): x is VotableEntity {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as Record<string, unknown>).id === "string" &&
    typeof (x as Record<string, unknown>).votes === "number"
  );
}

function patchVotesDeep<T>(
  data: T,
  targetId: string,
  patch: (votes: number) => Partial<VotableEntity>,
  depth = 0,
): T {
  if (depth > 6 || data == null || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((item) => {
      const patched = patchVotesDeep(item, targetId, patch, depth + 1);
      if (patched !== item) changed = true;
      return patched;
    });
    return (changed ? next : data) as T;
  }
  const obj = data as Record<string, unknown>;
  let out: Record<string, unknown> = obj;
  let changed = false;
  if (isVotable(obj) && obj.id === targetId) {
    out = { ...obj, ...patch(obj.votes as number) };
    changed = true;
  }
  for (const key of Object.keys(out)) {
    const val = out[key];
    if (val && typeof val === "object") {
      const patched = patchVotesDeep(val, targetId, patch, depth + 1);
      if (patched !== val) {
        if (out === obj) out = { ...obj };
        out[key] = patched;
        changed = true;
      }
    }
  }
  return (changed ? out : data) as T;
}

// Only query caches that can plausibly contain a votable node are scanned/patched —
// keeps the walk cheap and avoids touching unrelated caches like ['bootstrap'].
const VOTABLE_RESOURCES = new Set(["feed", "record", "comments", "boardThreads", "thread"]);

function votableQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.getQueriesData<unknown>({
    predicate: (q) => VOTABLE_RESOURCES.has(String(q.queryKey[0])),
  });
}

const VOTED_MAP_KEY = "ufo_voted";

function votedMapGet(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(VOTED_MAP_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function votedMapSet(key: string, voted: boolean) {
  try {
    const map = votedMapGet();
    map[key] = voted;
    localStorage.setItem(VOTED_MAP_KEY, JSON.stringify(map));
  } catch {
    /* private-mode/quota errors: voted-state just won't persist, non-fatal */
  }
}

function votedKey(targetType: VoteTargetType, targetId: string) {
  return `${targetType}:${targetId}`;
}

interface VoteMutationVars {
  target_type: VoteTargetType;
  target_id: string;
}

interface VoteMutationContext {
  previous: Array<[QueryKey, unknown]>;
  wasVoted: boolean;
  key: string;
}

export function useVote() {
  const queryClient = useQueryClient();
  return useMutation<VoteResult, Error, VoteMutationVars, VoteMutationContext>({
    mutationFn: (vars) => api.post<VoteResult>("/api/votes", vars),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ predicate: (q) => VOTABLE_RESOURCES.has(String(q.queryKey[0])) });

      const key = votedKey(vars.target_type, vars.target_id);
      const wasVoted = !!votedMapGet()[key];
      const delta = wasVoted ? -1 : 1;

      const previous: Array<[QueryKey, unknown]> = [];
      for (const [queryKey, data] of votableQueries(queryClient)) {
        const patched = patchVotesDeep(data, vars.target_id, (votes) => ({ votes: votes + delta }));
        if (patched !== data) {
          previous.push([queryKey, data]);
          queryClient.setQueryData(queryKey, patched);
        }
      }
      votedMapSet(key, !wasVoted);
      return { previous, wasVoted, key };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [queryKey, data] of ctx.previous) queryClient.setQueryData(queryKey, data);
      votedMapSet(ctx.key, ctx.wasVoted);
    },
    onSuccess: (data, vars) => {
      votedMapSet(votedKey(vars.target_type, vars.target_id), data.voted);
      for (const [queryKey, cur] of votableQueries(queryClient)) {
        const patched = patchVotesDeep(cur, vars.target_id, () => ({ votes: data.votes }));
        if (patched !== cur) queryClient.setQueryData(queryKey, patched);
      }
    },
    onSettled: (_data, _err, _vars, ctx) => {
      for (const [queryKey] of ctx?.previous ?? []) {
        void queryClient.invalidateQueries({ queryKey, exact: true });
      }
    },
  });
}

// Re-exported so screens can import a single Comment-shaped type alongside the hook
// without a second import from ./types when they only need this one.
export type { Comment };
