CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  access_token VARCHAR(2048),
  refresh_token VARCHAR(2048) NOT NULL
);

CREATE TABLE sessions (
  session_id UUID PRIMARY KEY,
  content TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_expires_index ON sessions (expires);

