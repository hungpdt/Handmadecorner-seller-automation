import { env } from "../config/env";
import { etsyRequest } from "./client";

interface FindShopsResponse {
  count: number;
  results: Array<{
    shop_id: number;
    shop_name: string;
  }>;
}

let cachedShopId: string | null = null;

export async function getConfiguredShopId(): Promise<string> {
  if (cachedShopId) return cachedShopId;

  if (/^\d+$/.test(env.etsyShopId)) {
    cachedShopId = env.etsyShopId;
    return cachedShopId;
  }

  const shopName = env.etsyShopName || env.etsyShopId;
  const response = await etsyRequest<FindShopsResponse>({
    method: "GET",
    url: "/shops",
    params: { shop_name: shopName, limit: 10 }
  });

  const match = response.results.find((shop) => shop.shop_name.toLowerCase() === shopName.toLowerCase());
  if (!match) {
    throw new Error(`Could not resolve Etsy shop name "${shopName}" to a numeric shop_id.`);
  }

  cachedShopId = String(match.shop_id);
  return cachedShopId;
}
