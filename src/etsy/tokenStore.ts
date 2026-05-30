import { db } from "../db/db";

export interface EtsyTokenRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface EtsyTokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export function getStoredToken(): EtsyTokenRecord | null {
  const row = db.prepare("SELECT access_token, refresh_token, expires_at FROM etsy_tokens WHERE id = 1").get() as
    | EtsyTokenRow
    | undefined;

  if (!row) return null;
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at
  };
}

export function saveToken(token: EtsyTokenRecord): void {
  db.prepare(
    `INSERT INTO etsy_tokens (id, access_token, refresh_token, expires_at, updated_at)
     VALUES (1, @accessToken, @refreshToken, @expiresAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       updated_at = excluded.updated_at`
  ).run({
    ...token,
    updatedAt: Date.now()
  });
}
