import crypto from "node:crypto";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import axios from "axios";
import { env } from "../config/env";
import { runMigrations } from "../db/migrations";
import { saveToken } from "./tokenStore";
import { logger } from "../utils/logger";

const ETSY_AUTHORIZE_URL = "https://www.etsy.com/oauth/connect";
const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
export const ETSY_SCOPES = ["shops_r", "transactions_r"];

export interface PkceSession {
  state: string;
  codeVerifier: string;
  authorizeUrl: string;
}

export function createPkceSession(): PkceSession {
  const codeVerifier = base64Url(crypto.randomBytes(64));
  const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
  const state = base64Url(crypto.randomBytes(24));

  const params = new URLSearchParams({
    response_type: "code",
    redirect_uri: env.etsyRedirectUri,
    scope: ETSY_SCOPES.join(" "),
    client_id: env.etsyKeystring,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });

  return {
    state,
    codeVerifier,
    authorizeUrl: `${ETSY_AUTHORIZE_URL}?${params.toString()}`
  };
}

export async function exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<void> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.etsyKeystring,
    redirect_uri: env.etsyRedirectUri,
    code,
    code_verifier: codeVerifier
  });

  const response = await axios.post(ETSY_TOKEN_URL, body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  saveToken({
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresAt: Date.now() + Number(response.data.expires_in) * 1000
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<void> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.etsyKeystring,
    refresh_token: refreshToken
  });

  const response = await axios.post(ETSY_TOKEN_URL, body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  saveToken({
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token || refreshToken,
    expiresAt: Date.now() + Number(response.data.expires_in) * 1000
  });
}

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function extractCode(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Callback URL does not contain a code query parameter.");
    return code;
  }
  return trimmed;
}

async function runCli(): Promise<void> {
  runMigrations();
  const session = createPkceSession();
  logger.info("Open this Etsy OAuth URL in your browser:");
  console.log(session.authorizeUrl);
  console.log("");
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question("Paste the authorization code or full callback URL here: ");
  rl.close();
  await exchangeAuthorizationCode(extractCode(answer), session.codeVerifier);
  logger.info("Etsy OAuth token saved to SQLite.");
}

if (require.main === module) {
  runCli().catch((error) => {
    logger.error("OAuth setup failed", { message: error.message });
    process.exit(1);
  });
}
