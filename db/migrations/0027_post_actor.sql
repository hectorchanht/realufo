-- Salted hash of the poster's anonymous browser id (same hash votes use), so a
-- reply by the thread's OP can show an "OP" badge. Never sent to clients.
-- NULL for posts made before this column existed (they just get no badge).
ALTER TABLE posts ADD COLUMN actor_id TEXT;
