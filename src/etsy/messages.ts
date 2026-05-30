import { getMessageEndpointDiscovery } from "./messageDiscovery";

export interface EtsyMessageAttachment {
  url?: string;
  contentType?: string;
}

export interface EtsyBuyerMessage {
  id: string;
  customerName: string;
  text: string;
  createdAt: string;
  attachments: EtsyMessageAttachment[];
}

export async function fetchNewBuyerMessages(): Promise<EtsyBuyerMessage[]> {
  const discovery = getMessageEndpointDiscovery();
  if (!discovery.supported) {
    return [];
  }

  throw new Error("Etsy buyer message endpoint support has not been implemented because no official endpoint exists.");
}
