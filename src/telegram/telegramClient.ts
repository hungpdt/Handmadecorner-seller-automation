import axios from "axios";
import { env } from "../config/env";

const baseUrl = `https://api.telegram.org/bot${env.telegramBotToken}`;

export async function sendTelegramMessage(text: string): Promise<void> {
  await axios.post(`${baseUrl}/sendMessage`, {
    chat_id: env.telegramChatId,
    text
  });
}

export async function sendTelegramPhoto(photoUrl: string, caption?: string): Promise<void> {
  await axios.post(`${baseUrl}/sendPhoto`, {
    chat_id: env.telegramChatId,
    photo: photoUrl,
    caption
  });
}

export async function sendTelegramTestMessage(): Promise<void> {
  await sendTelegramMessage("Etsy Telegram automation test message.");
}
