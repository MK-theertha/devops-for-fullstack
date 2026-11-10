CREATE TABLE IF NOT EXISTS notes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_created_at_idx ON notes (created_at DESC);
