import { SessionData, Store } from "express-session";
import { Pool } from "pg";

type SessionRecord = {
  session_id: string;
  content: string;
  expires: Date;
};

export class SessionStore extends Store {
  private readonly ttl = 3600 * 60 * 1000;

  constructor(readonly pool: Pool) {
    super();
  }

  get(
    sid: string,
    callback: (err: any, session?: SessionData | null | undefined) => void
  ): void {
    this.setDeleteExpiredSessionInterval();

    (async () => {
      let client;
      try {
        client = await this.pool.connect();
        const { rows } = await client.query<SessionRecord>(
          "SELECT * FROM sessions WHERE session_id = $1 AND expires >= $2",
          [sid, new Date()]
        );
        if (rows.length === 0) {
          return callback(null);
        }

        const { content } = rows[0];
        return callback(null, JSON.parse(content));
      } catch (err) {
        return callback(err);
      } finally {
        if (client) {
          client.release();
        }
      }
    })();
  }

  set(
    sid: string,
    session: SessionData,
    callback?: ((err?: any) => void) | undefined
  ): void {
    this.setDeleteExpiredSessionInterval();

    (async () => {
      let client;
      try {
        client = await this.pool.connect();
        await client.query(
          "INSERT INTO sessions (session_id, content, expires) VALUES ($1, $2, $3) ON CONFLICT (session_id) DO UPDATE SET session_id = $1, content = $2, expires = $3",
          [
            sid,
            JSON.stringify(session),
            new Date(Date.now() + (session.cookie.maxAge ?? this.ttl)),
          ]
        );
        return callback?.();
      } catch (err) {
        return callback?.(err);
      } finally {
        if (client) {
          client.release();
        }
      }
    })();
  }

  destroy(sid: string, callback?: ((err?: any) => void) | undefined): void {
    this.setDeleteExpiredSessionInterval();

    (async () => {
      let client;
      try {
        client = await this.pool.connect();
        await client.query("DELETE FROM sessions WHERE session_id = $1", [sid]);
        return callback?.();
      } catch (err) {
        return callback?.(err);
      } finally {
        if (client) {
          client.release();
        }
      }
    })();
  }

  touch(
    sid: string,
    session: SessionData,
    callback?: (() => void) | undefined
  ): void {
    this.setDeleteExpiredSessionInterval();

    (async () => {
      let client;
      try {
        client = await this.pool.connect();
        await client.query(
          "UPDATE sessions SET expires = $1 WHERE session_id = $2",
          [new Date(Date.now() + (session.cookie.maxAge ?? this.ttl)), sid]
        );
        return callback?.();
      } catch (err) {
        return callback?.();
      } finally {
        if (client) {
          client.release();
        }
      }
    })();
  }

  private deleteExpiredSessionTimer?: NodeJS.Timer;
  private setDeleteExpiredSessionInterval() {
    if (this.deleteExpiredSessionTimer) {
      return;
    }

    this.deleteExpiredSessionTimer = setInterval(async () => {
      let client;
      try {
        client = await this.pool.connect();
        await client.query("DELETE FROM sessions WHERE expires < $1", [
          new Date(),
        ]);
      } catch (err) {
        console.error(err);
      } finally {
        if (client) {
          client.release();
        }
      }
    }, 3600 * 1000);
  }
}
