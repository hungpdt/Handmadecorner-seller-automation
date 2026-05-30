import dotenv from "dotenv";

dotenv.config({ override: true });

function optional(name: string, fallback = ""): string {
  return (process.env[name] || fallback).trim();
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function numberValue(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }
  return parsed;
}

function booleanValue(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export const env = {
  etsyKeystring: required("ETSY_KEYSTRING"),
  etsySharedSecret: optional("ETSY_SHARED_SECRET"),
  etsyShopId: required("ETSY_SHOP_ID"),
  etsyShopName: optional("ETSY_SHOP_NAME"),
  etsyRedirectUri: optional("ETSY_REDIRECT_URI", "http://localhost:3000/oauth/etsy/callback"),
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  telegramChatId: required("TELEGRAM_CHAT_ID"),
  databasePath: optional("DATABASE_PATH", "./data/app.db"),
  pollIntervalSeconds: numberValue("POLL_INTERVAL_SECONDS", 60),
  port: numberValue("PORT", 3000),
  adminToken: optional("ADMIN_TOKEN"),
  enableDebugEndpoints: booleanValue("ENABLE_DEBUG_ENDPOINTS", false)
};

if (env.etsySharedSecret && env.etsySharedSecret === env.etsyKeystring) {
  throw new Error("ETSY_SHARED_SECRET is the same as ETSY_KEYSTRING. Copy the app Shared Secret from Etsy Developer.");
}

export function getEnvDebugInfo(): Record<string, unknown> {
  const etsyApiKeyHeader = env.etsySharedSecret ? `${env.etsyKeystring}:${env.etsySharedSecret}` : env.etsyKeystring;

  return {
    etsyKeystring: mask(env.etsyKeystring),
    etsyKeystringLength: env.etsyKeystring.length,
    etsySharedSecretSet: Boolean(env.etsySharedSecret),
    etsySharedSecret: mask(env.etsySharedSecret),
    etsySharedSecretLength: env.etsySharedSecret.length,
    etsyApiKeyHeader: maskApiKeyHeader(etsyApiKeyHeader),
    etsyApiKeyHeaderLength: etsyApiKeyHeader.length,
    etsyApiKeyHeaderColonCount: (etsyApiKeyHeader.match(/:/g) || []).length,
    etsyShopId: env.etsyShopId,
    etsyShopName: env.etsyShopName,
    etsyRedirectUri: env.etsyRedirectUri,
    databasePath: env.databasePath,
    debugEndpointsEnabled: env.enableDebugEndpoints
  };
}

function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}...${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function maskApiKeyHeader(value: string): string {
  const [keystring, ...secretParts] = value.split(":");
  const secret = secretParts.join(":");
  if (!secret) return mask(keystring);
  return `${mask(keystring)}:${mask(secret)}`;
}
