import express, { Request, Response, NextFunction } from "express";
import { env, getEnvDebugInfo } from "./config/env";
import { runMigrations } from "./db/migrations";
import { createPkceSession, exchangeAuthorizationCode, ETSY_SCOPES, PkceSession } from "./etsy/auth";
import { getMessageEndpointDiscovery } from "./etsy/messageDiscovery";
import { fetchLatestOrders } from "./etsy/orders";
import { fetchConfiguredShop } from "./etsy/shop";
import { startEtsyMessagePolling } from "./jobs/pollEtsyMessages";
import { formatOrderTelegramMessage, pollEtsyOrdersOnce, startEtsyOrderPolling } from "./jobs/pollEtsyOrders";
import { sendTelegramMessage, sendTelegramTestMessage } from "./telegram/telegramClient";
import { logger } from "./utils/logger";

runMigrations();

const app = express();
app.use(express.json());

let pendingPkceSession: PkceSession | null = null;

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

if (env.enableDebugEndpoints) {
  app.get("/debug/env", requireAdminToken, (_req, res) => {
    res.json({ ok: true, env: getEnvDebugInfo() });
  });
}

app.get("/oauth/etsy/start", (_req, res) => {
  pendingPkceSession = createPkceSession();
  res.json({
    authorizeUrl: pendingPkceSession.authorizeUrl,
    scopes: ETSY_SCOPES,
    redirectUri: env.etsyRedirectUri
  });
});

app.get("/oauth/etsy/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state;

    if (typeof code !== "string" || typeof state !== "string") {
      res.status(400).send("Missing code or state.");
      return;
    }

    if (!pendingPkceSession || pendingPkceSession.state !== state) {
      res.status(400).send("OAuth state mismatch. Start again at /oauth/etsy/start.");
      return;
    }

    await exchangeAuthorizationCode(code, pendingPkceSession.codeVerifier);
    pendingPkceSession = null;
    res.send("Etsy OAuth token saved. You can close this tab.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("OAuth callback failed", { message });
    res.status(500).send("OAuth token exchange failed. Check server logs.");
  }
});

app.get("/etsy/message-discovery", requireAdminToken, (_req, res) => {
  res.json(getMessageEndpointDiscovery());
});

app.post("/etsy/orders/poll", requireAdminToken, async (_req, res) => {
  try {
    const result = await pollEtsyOrdersOnce();
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/etsy/orders/latest", requireAdminToken, async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit || 3);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 3;
    const orders = await fetchLatestOrders(limit);
    res.json({ ok: true, count: orders.length, orders });
  } catch (error) {
    res.status(500).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.post("/etsy/orders/latest/send-telegram", requireAdminToken, async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit || 3);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 3;
    const orders = await fetchLatestOrders(limit);

    for (const order of orders) {
      await sendTelegramMessage(formatOrderTelegramMessage(order));
    }

    res.json({ ok: true, sent: orders.length });
  } catch (error) {
    res.status(500).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/etsy/shop/test", requireAdminToken, async (_req, res) => {
  try {
    const shop = await fetchConfiguredShop();
    res.json({ ok: true, shop });
  } catch (error) {
    res.status(500).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.post("/telegram/test", requireAdminToken, async (_req, res) => {
  await sendTelegramTestMessage();
  res.json({ ok: true });
});

app.listen(env.port, () => {
  logger.info(`Server listening on http://localhost:${env.port}`);
  startEtsyMessagePolling();
  startEtsyOrderPolling();
});

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  if (!env.adminToken) {
    next();
    return;
  }

  const headerToken = req.header("x-admin-token");
  const queryToken = typeof req.query.token === "string" ? req.query.token : "";

  if (headerToken === env.adminToken || queryToken === env.adminToken) {
    next();
    return;
  }

  res.status(401).json({ ok: false, error: "Missing or invalid admin token." });
}
