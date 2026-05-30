import { db } from "../db/db";
import { env } from "../config/env";
import { EtsyOrder, fetchRecentOrders } from "../etsy/orders";
import { sendTelegramMessage } from "../telegram/telegramClient";
import { logger } from "../utils/logger";

const ORDER_LOOKBACK_SECONDS = 7 * 24 * 60 * 60;

let timer: NodeJS.Timeout | null = null;

export function startEtsyOrderPolling(): void {
  void safePollEtsyOrdersOnce();
  timer = setInterval(() => void safePollEtsyOrdersOnce(), env.pollIntervalSeconds * 1000);
}

export function stopEtsyOrderPolling(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function pollEtsyOrdersOnce(): Promise<{ checked: number; sent: number; seeded: number }> {
  const minCreatedTimestamp = Math.floor(Date.now() / 1000) - ORDER_LOOKBACK_SECONDS;
  const orders = await fetchRecentOrders(minCreatedTimestamp);
  const shouldSeedOnly = !hasProcessedOrders();

  let sent = 0;
  let seeded = 0;

  for (const order of orders) {
    if (isProcessed(order.receiptId)) continue;

    if (shouldSeedOnly) {
      markProcessed(order);
      seeded += 1;
      continue;
    }

    await sendTelegramMessage(formatOrderMessage(order));
    markProcessed(order);
    sent += 1;
  }

  if (shouldSeedOnly && seeded > 0) {
    logger.info("Seeded existing Etsy orders without sending Telegram notifications", { count: seeded });
  }

  return { checked: orders.length, sent, seeded };
}

async function safePollEtsyOrdersOnce(): Promise<void> {
  try {
    const result = await pollEtsyOrdersOnce();
    if (result.sent > 0 || result.seeded > 0) {
      logger.info("Etsy order polling completed", result);
    }
  } catch (error) {
    logger.error("Etsy order polling failed", { message: getErrorMessage(error) });
  }
}

function hasProcessedOrders(): boolean {
  const row = db.prepare("SELECT 1 FROM processed_orders LIMIT 1").get();
  return Boolean(row);
}

function isProcessed(receiptId: string): boolean {
  const row = db.prepare("SELECT receipt_id FROM processed_orders WHERE receipt_id = ?").get(receiptId);
  return Boolean(row);
}

function markProcessed(order: EtsyOrder): void {
  db.prepare(
    "INSERT OR IGNORE INTO processed_orders (receipt_id, created_timestamp, sent_at) VALUES (?, ?, ?)"
  ).run(order.receiptId, order.createdTimestamp || null, Date.now());
}

function formatOrderMessage(order: EtsyOrder): string {
  const itemLines = order.items.length
    ? order.items.flatMap((item) => {
        const base = `- ${item.title} x ${item.quantity}${item.price !== "Unknown" ? ` (${item.price})` : ""}`;
        const variations = item.variations.map((variation) => `  ${variation}`);
        return [base, ...variations];
      })
    : ["- No transaction items returned by Etsy"];

  return [
    "\uD83D\uDD14 New Etsy Order",
    "",
    `Order ID: ${order.receiptId}`,
    `Buyer: ${order.buyerName}`,
    `Total: ${order.total}`,
    `Status: ${order.status}`,
    `Paid: ${order.isPaid ? "Yes" : "No"}`,
    `Shipped: ${order.isShipped ? "Yes" : "No"}`,
    `Created: ${formatTimestamp(order.createdTimestamp)}`,
    "",
    "Items:",
    ...itemLines,
    "",
    "Ship to:",
    order.shippingAddress || "Address not returned by Etsy API for this app/account."
  ].join("\n");
}

export function formatOrderTelegramMessage(order: EtsyOrder): string {
  return formatOrderMessage(order);
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return "Unknown";
  return new Date(timestamp * 1000).toISOString();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
