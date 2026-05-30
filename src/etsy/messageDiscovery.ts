export interface MessageEndpointDiscovery {
  supported: boolean;
  checkedAt: string;
  officialSpecUrl: string;
  reason: string;
  searchedTerms: string[];
}

export function getMessageEndpointDiscovery(): MessageEndpointDiscovery {
  return {
    supported: false,
    checkedAt: "2026-05-09",
    officialSpecUrl: "https://www.etsy.com/openapi/generated/oas/3.0.0.json",
    reason:
      "Etsy Open API v3 currently does not expose an official endpoint for buyer conversations/messages/attachments for this use case.",
    searchedTerms: ["conversation", "conversations", "message", "messages", "attachment", "attachments"]
  };
}
