import { etsyRequest } from "./client";
import { getConfiguredShopId } from "./shopId";

export async function fetchConfiguredShop(): Promise<unknown> {
  const shopId = await getConfiguredShopId();
  return etsyRequest({
    method: "GET",
    url: `/shops/${shopId}`
  });
}
