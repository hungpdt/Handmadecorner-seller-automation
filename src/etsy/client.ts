import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { env } from "../config/env";
import { getStoredToken } from "./tokenStore";
import { refreshAccessToken } from "./auth";

const ETSY_API_BASE_URL = "https://api.etsy.com/v3/application";
const REFRESH_SKEW_MS = 5 * 60 * 1000;

async function getValidAccessToken(): Promise<string> {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No Etsy OAuth token found. Run npm run oauth:init first.");
  }

  if (token.expiresAt - Date.now() <= REFRESH_SKEW_MS) {
    await refreshAccessToken(token.refreshToken);
    const refreshed = getStoredToken();
    if (!refreshed) throw new Error("Token refresh did not persist a token.");
    return refreshed.accessToken;
  }

  return token.accessToken;
}

export async function etsyRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const accessToken = await getValidAccessToken();

  try {
    const response = await axios.request<T>({
      baseURL: ETSY_API_BASE_URL,
      ...config,
      headers: {
        "x-api-key": getEtsyApiKeyHeader(),
        Authorization: `Bearer ${accessToken}`,
        ...(config.headers || {})
      }
    });
    return response.data;
  } catch (error) {
    if (isUnauthorized(error)) {
      const stored = getStoredToken();
      if (!stored) throw error;
      await refreshAccessToken(stored.refreshToken);
      const retryToken = await getValidAccessToken();
      const response = await axios.request<T>({
        baseURL: ETSY_API_BASE_URL,
        ...config,
        headers: {
          "x-api-key": getEtsyApiKeyHeader(),
          Authorization: `Bearer ${retryToken}`,
          ...(config.headers || {})
        }
      });
      return response.data;
    }

    throw toEtsyApiError(error);
  }
}

function isUnauthorized(error: unknown): error is AxiosError {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

function getEtsyApiKeyHeader(): string {
  if (!env.etsySharedSecret) return env.etsyKeystring;
  return `${env.etsyKeystring}:${env.etsySharedSecret}`;
}

function toEtsyApiError(error: unknown): Error {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const status = error.response?.status;
  const responseData = error.response?.data;
  const detail = typeof responseData === "string" ? responseData : JSON.stringify(responseData);
  return new Error(`Etsy API ${status || "request failed"}: ${detail || error.message}`);
}
