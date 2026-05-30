import { etsyRequest } from "./client";
import { getConfiguredShopId } from "./shopId";

interface EtsyListResponse<T> {
  count: number;
  results: T[];
}

interface EtsyMoney {
  amount?: number;
  divisor?: number;
  currency_code?: string;
}

interface EtsyReceiptRaw {
  receipt_id: number;
  name?: string;
  status?: string;
  is_paid?: boolean;
  is_shipped?: boolean;
  created_timestamp?: number;
  creation_timestamp?: number;
  grandtotal?: EtsyMoney;
  total_price?: EtsyMoney;
  total_shipping_cost?: EtsyMoney;
  first_line?: string;
  second_line?: string;
  city?: string;
  state?: string;
  zip?: string;
  country_iso?: string;
  formatted_address?: string;
}

interface EtsyTransactionRaw {
  transaction_id: number;
  title?: string;
  quantity?: number;
  price?: EtsyMoney;
  variations?: Array<{ formatted_name?: string; formatted_value?: string }>;
  product_data?: Array<{ property_name?: string; values?: string[] }>;
}

const ETSY_REQUEST_SPACING_MS = 350;

export interface EtsyOrderItem {
  transactionId: string;
  title: string;
  quantity: number;
  price: string;
  variations: string[];
}

export interface EtsyOrder {
  receiptId: string;
  buyerName: string;
  status: string;
  isPaid: boolean;
  isShipped: boolean;
  createdTimestamp: number;
  total: string;
  shippingAddress: string;
  items: EtsyOrderItem[];
}

export async function fetchRecentOrders(minCreatedTimestamp: number): Promise<EtsyOrder[]> {
  const shopId = await getConfiguredShopId();
  const receipts = await etsyRequest<EtsyListResponse<EtsyReceiptRaw>>({
    method: "GET",
    url: `/shops/${shopId}/receipts`,
    params: {
      min_created: minCreatedTimestamp,
      limit: 25,
      legacy: false
    }
  });

  const orders = await receiptsToOrders(receipts.results || [], shopId);
  return orders.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

export async function fetchLatestOrders(limit: number): Promise<EtsyOrder[]> {
  const shopId = await getConfiguredShopId();
  const safeLimit = Math.min(Math.max(limit, 1), 25);
  const receipts = await etsyRequest<EtsyListResponse<EtsyReceiptRaw>>({
    method: "GET",
    url: `/shops/${shopId}/receipts`,
    params: {
      limit: 100,
      offset: 0,
      legacy: false
    }
  });

  const newestReceipts = (receipts.results || [])
    .sort((a, b) => getReceiptTimestamp(b) - getReceiptTimestamp(a))
    .slice(0, safeLimit);

  const orders = await receiptsToOrders(newestReceipts, shopId);
  return orders.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
}

async function receiptsToOrders(receipts: EtsyReceiptRaw[], shopId: string): Promise<EtsyOrder[]> {
  const orders: EtsyOrder[] = [];

  for (const receipt of receipts) {
    if (orders.length > 0) {
      await delay(ETSY_REQUEST_SPACING_MS);
    }
    orders.push(await toOrderWithItems(receipt, shopId));
  }

  return orders;
}

async function toOrderWithItems(receipt: EtsyReceiptRaw, shopId: string): Promise<EtsyOrder> {
  const transactions = await etsyRequest<EtsyListResponse<EtsyTransactionRaw>>({
    method: "GET",
    url: `/shops/${shopId}/receipts/${receipt.receipt_id}/transactions`,
    params: { legacy: false }
  });

  return {
    receiptId: String(receipt.receipt_id),
    buyerName: receipt.name || "Unknown",
    status: receipt.status || "unknown",
    isPaid: Boolean(receipt.is_paid),
    isShipped: Boolean(receipt.is_shipped),
    createdTimestamp: receipt.created_timestamp || receipt.creation_timestamp || 0,
    total: formatMoney(receipt.grandtotal || receipt.total_price),
    shippingAddress: formatAddress(receipt),
    items: (transactions.results || []).map(toOrderItem)
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toOrderItem(transaction: EtsyTransactionRaw): EtsyOrderItem {
  return {
    transactionId: String(transaction.transaction_id),
    title: transaction.title || "Untitled item",
    quantity: transaction.quantity || 1,
    price: formatMoney(transaction.price),
    variations: formatVariations(transaction)
  };
}

function getReceiptTimestamp(receipt: EtsyReceiptRaw): number {
  return receipt.created_timestamp || receipt.creation_timestamp || 0;
}

function formatMoney(money?: EtsyMoney): string {
  if (!money || typeof money.amount !== "number") return "Unknown";
  const divisor = money.divisor || 100;
  const value = money.amount / divisor;
  const currency = money.currency_code || "";
  return `${value.toFixed(2)} ${currency}`.trim();
}

function formatAddress(receipt: EtsyReceiptRaw): string {
  if (receipt.formatted_address) return receipt.formatted_address;

  return [
    receipt.first_line,
    receipt.second_line,
    [receipt.city, receipt.state, receipt.zip].filter(Boolean).join(", "),
    receipt.country_iso
  ]
    .filter(Boolean)
    .join("\n");
}

function formatVariations(transaction: EtsyTransactionRaw): string[] {
  if (transaction.variations?.length) {
    return transaction.variations
      .map((variation) => [variation.formatted_name, variation.formatted_value].filter(Boolean).join(": "))
      .filter(Boolean);
  }

  if (transaction.product_data?.length) {
    return transaction.product_data
      .map((property) => [property.property_name, property.values?.join(", ")].filter(Boolean).join(": "))
      .filter(Boolean);
  }

  return [];
}
