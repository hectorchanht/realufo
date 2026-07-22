// TypeScript mirrors of every shape returned by worker/routes/*.ts.
// Source of truth: docs/superpowers/FRONTEND-CONTEXT.md ("API" section), cross-checked
// against the actual route handlers + db/schema.sql (columns are SQLite rows spread with
// `...row`, so `redacted`/`is_op`/`online` etc. are the raw 0|1 integers, not booleans).
//
// Two RecordCard shapes: see the "RecordCard" section below — GET /api/feed and
// GET /api/records return DIFFERENT projections of the same `records` table row.

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type RecordKind = "pdf" | "image" | "video";
export type Stance = "believer" | "skeptic" | "analyst" | "neutral" | null;
export type VoteTargetType = "thread" | "post" | "comment";

// ---------------------------------------------------------------------------
// GET /api/bootstrap
// ---------------------------------------------------------------------------

export interface Archive {
  id: string;
  label: string;
  flag: string;
  accent: string;
  count: number;
  coord: string;
}

/** Full `boards` row (as returned by bootstrap and GET /api/boards/:id/threads). */
export interface Board {
  id: string;
  slug: string;
  name: string;
  desc: string;
  accent: string;
  icon: string;
  online: number; // 0|1
  thread_count: number;
}

export interface Stats {
  records: number;
  archives: number;
  countries: number;
  videos: number;
  onlineNow: number;
  threads: number;
  postsToday: number;
  yearsCovered: number;
  byDecade: Array<[label: string, n: number]>;
  topLocations: Array<[label: string, n: number]>;
}

export interface TickerItem {
  kind: string;
  board: string;
  text: string;
  ago: string;
}

export interface Sighting {
  id: number;
  name: string;
  lat: number;
  lng: number;
  count: number;
  accent: string;
  case_slug: string | null;
}

/** Slim case projection used in bootstrap's `cases[]` (map pins / case chips). */
export interface CaseLite {
  slug: string;
  name: string;
  accent: string;
  coord: string;
}

export interface Bootstrap {
  archives: Archive[];
  boards: Board[];
  stats: Stats;
  ticker: TickerItem[];
  sightings: Sighting[];
  cases: CaseLite[];
}

// ---------------------------------------------------------------------------
// RecordCard — two distinct projections of the `records` table.
//
//   FeedRecordCard  ← GET /api/feed            (featured[])   has credible, commentN
//   ListRecordCard  ← GET /api/records          (records[])    has location, incident_date, doc_date
//
// They share the same base columns; each adds fields the other endpoint doesn't select.
// Modeled as two named interfaces (rather than one interface with everything optional)
// so a component that only ever renders one of the two lists gets full, non-optional typing;
// `RecordCard` is the union for the rare spot that needs to handle either.
// ---------------------------------------------------------------------------

interface RecordCardBase {
  id: string;
  archive: string;
  agency: string;
  title: string;
  summary: string;
  kind: RecordKind;
  redacted: number; // 0|1
  thumb: string | null;
}

/** RecordCard shape from GET /api/feed → `featured[]`. */
export interface FeedRecordCard extends RecordCardBase {
  credible: number; // synthetic "credibility" score computed by the worker
  commentN: number;
}

/** RecordCard shape from GET /api/records → `records[]`. */
export interface ListRecordCard extends RecordCardBase {
  location: string | null;
  incident_date: string | null;
  doc_date: string | null;
}

/** Union of both RecordCard projections — narrow with `"credible" in card` or `"location" in card`. */
export type RecordCard = FeedRecordCard | ListRecordCard;

export interface Feed {
  featured: FeedRecordCard[];
  hot: ThreadCard[];
}

export interface RecordsListResponse {
  count: number;
  records: ListRecordCard[];
}

// ---------------------------------------------------------------------------
// GET /api/records/:id — full record + assets + promoted threads
// ---------------------------------------------------------------------------

/** Full `records` row (`SELECT * FROM records`), as returned inside RecordDetail. */
export interface RecordFull {
  id: string;
  archive: string;
  agency: string;
  agency_full: string | null;
  title: string;
  summary: string | null;
  incident_date: string | null;
  location: string | null;
  doc_date: string | null;
  kind: RecordKind;
  redacted: number; // 0|1
  featured: number; // 0|1
  virin: string | null;
  source_url: string | null;
  source_site: string | null;
  retrieved_at: string | null;
  license: string | null;
  status: "pending" | "fetched" | "processed" | "live" | "failed";
  checksum: string | null;
  created_at: string;
}

export interface Asset {
  role: "thumb" | "full" | "original";
  cdn_url: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
}

/** One row of RecordDetail's `promotedThreads[]` — a thread that was "promoted" from this record. */
export interface PromotedThread {
  id: string;
  no: number;
  title: string;
  stance: Stance;
  votes: number;
  source_record_id: string | null;
  boardSlug: string;
  accent: string;
}

export interface RecordDetail {
  record: RecordFull;
  assets: Asset[];
  promotedThreads: PromotedThread[];
}

// ---------------------------------------------------------------------------
// GET/POST /api/records/:id/comments
// ---------------------------------------------------------------------------

export interface Comment {
  id: string;
  no: number;
  body: string;
  handle: string | null;
  stance: Stance;
  votes: number;
  created_at: string;
  ago: string;
  /** `"!" + handle` when a handle was given, else null — display-ready label. */
  handleShow: string | null;
}

export interface CommentsResponse {
  comments: Comment[];
}

export interface AddCommentResponse {
  comment: Comment;
}

// ---------------------------------------------------------------------------
// Threads / posts
// ---------------------------------------------------------------------------

/**
 * ThreadCard: the projection used in board thread listings and /api/feed's `hot[]`.
 * `tags` is parsed to `string[]` by /api/boards/:id/threads and /api/threads/:id, BUT
 * /api/feed's `hot[]` mapping does NOT JSON.parse it (worker quirk) — it can arrive as
 * the raw JSON-encoded string there. Treat `tags` defensively (check `Array.isArray`).
 */
export interface ThreadCard {
  id: string;
  no: number;
  board_id: string;
  boardSlug: string;
  accent: string;
  title: string;
  op_body: string;
  stance: Stance;
  reply_count: number;
  img_count: number;
  votes: number;
  hot: number; // 0|1
  ago: string;
  tags?: string[] | string;
}

export interface BoardThreadsResponse {
  board: Board;
  threads: ThreadCard[];
}

/** Full `threads` row (as returned inside GET /api/threads/:id's `thread`). */
export interface ThreadFull extends ThreadCard {
  op_handle: string | null;
  op_id: string;
  mins: number | null;
  source_record_id: string | null;
  case_slug: string | null;
  created_at: string;
  tags: string[]; // parsed here (unlike the feed-hot ThreadCard quirk above)
}

/** The `sourceRecord` chip on a thread's detail page ("◂ from record"), or null. */
export interface ThreadSourceRecord {
  id: string;
  agency: string;
  title: string;
  kind: RecordKind;
  thumb: string | null;
}

/**
 * Post: a reply row inside GET /api/threads/:id's `posts[]`.
 * The 201 response from POST /api/threads/:id/posts echoes a SUBSET of these fields
 * (no `reply_to`, no `is_op`, no `handleShow` — see CreatePostResponse below);
 * `reply_to`/`is_op`/`handleShow` are marked optional here to cover both.
 */
export interface Post {
  id: string;
  no: number;
  thread_id: string;
  body: string;
  handle: string | null;
  stance: Stance;
  votes: number;
  source_record_id: string | null;
  image_kind: string | null;
  image_label: string | null;
  reply_to?: string[]; // parsed from JSON; present on GET, absent on the POST echo
  is_op?: number; // 0|1 raw column; present on GET, absent on the POST echo
  isOp: boolean; // computed convenience boolean, present on both
  created_at: string;
  ago: string;
  handleShow?: string | null;
}

export interface ThreadDetail {
  thread: ThreadFull;
  sourceRecord: ThreadSourceRecord | null;
  posts: Post[];
}

/**
 * Shape of `thread` in the 201 response from POST /api/threads. Distinct from
 * ThreadFull because the created-thread echo omits `hot`, `mins`, `case_slug`.
 */
export interface NewThread {
  id: string;
  no: number;
  board_id: string;
  boardSlug: string;
  accent: string;
  title: string;
  stance: Stance;
  op_body: string;
  op_handle: string | null;
  op_id: string;
  tags: string[];
  votes: number;
  reply_count: number;
  img_count: number;
  source_record_id: string | null;
  created_at: string;
  ago: string;
}

export interface CreateThreadResponse {
  thread: NewThread;
}

export interface CreatePostResponse {
  post: Post;
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

export interface VoteResult {
  voted: boolean;
  votes: number;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export interface Case {
  slug: string;
  name: string;
  archive: string;
  archive_label: string;
  accent: string;
  coord: string;
  lede: string;
  pull: string;
  pull_cite: string;
  status: string;
}

/** The "◂ from record" style related-thread chip on a case detail page, or null. */
export interface RelatedThread {
  id: string;
  title: string;
  boardSlug: string;
  accent: string;
  ago: string;
}

export interface CaseDetail {
  case: Case;
  relatedThread: RelatedThread | null;
}

// ---------------------------------------------------------------------------
// Auth (stub — FEATURE_AUTH=false)
// ---------------------------------------------------------------------------

export interface AuthStub {
  stub: true;
  me: { handle: string };
}

// ---------------------------------------------------------------------------
// Error shape (any non-2xx response body)
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
}
