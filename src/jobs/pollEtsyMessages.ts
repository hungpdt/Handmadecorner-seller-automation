import { db } from "../db/db";
import { env } from "../config/env";
import { getMessageEndpointDiscovery } from "../etsy/messageDiscovery";
import { fetchNewBuyerMessages, EtsyBuyerMessage } from "../etsy/messages";
import { sendTelegramMessage, sendTelegramPhoto } from "../telegram/telegramClient";
import { logger } from "../utils/logger";

let timer: NodeJS.Timeout | null = null;

export function startEtsyMessagePolling(): void {
  const discovery = getMessageEndpointDiscovery();
  if (!discovery.supported) {
    logger.warn("Etsy message polling disabled", { reason: discovery.reason });
    return;
  }

  void pollOnce();
  timer = setInterval(() => void pollOnce(), env.pollIntervalSeconds * 1000);
}

export function stopEtsyMessagePolling(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function pollOnce(): Promise<void> {
  try {
    const messages = await fetchNewBuyerMessages();
    for (const message of messages) {
      if (isProcessed(message.id)) continue;
      await forwardMessage(message);
      markProcessed(message.id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Etsy message polling failed", { message });
  }
}

async function forwardMessage(message: EtsyBuyerMessage): Promise<void> {
  await sendTelegramMessage(formatTelegramMessage(message));

  for (const attachment of message.attachments) {
    if (attachment.url && attachment.contentType?.startsWith("image/")) {
      await sendTelegramPhoto(attachment.url);
    }
  }

  if (message.attachments.length > 0 && message.attachments.every((attachment) => !attachment.url)) {
    await sendTelegramMessage("Customer may have sent images/attachments. Please check Etsy manually.");
  }
}

function formatTelegramMessage(message: EtsyBuyerMessage): string {
  return [
    "🔔 New Etsy Message",
    "",
    `Customer: ${message.customerName}`,
    "",
    "Message:",
    message.text,
    "",
    `Attachments: ${message.attachments.length}`
  ].join("\n");
}

function isProcessed(messageId: string): boolean {
  const row = db.prepare("SELECT message_id FROM processed_messages WHERE message_id = ?").get(messageId);
  return Boolean(row);
}

function markProcessed(messageId: string): void {
  db.prepare("INSERT OR IGNORE INTO processed_messages (message_id, created_at) VALUES (?, ?)").run(messageId, Date.now());
}
