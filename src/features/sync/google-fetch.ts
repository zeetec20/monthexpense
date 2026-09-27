import { RECEIPT_API_KEY } from "@/config/env";
import { client } from "@/lib/api-client";

export interface GoogleFetchOptions extends RequestInit {
  maxRetries?: number;
  useProxyFallback?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const isNetworkOrTransientError = (err: unknown): boolean => {
  if (err instanceof TypeError) {
    // "Failed to fetch", "NetworkError", "Load failed"
    return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("network") ||
      msg.includes("err_") ||
      msg.includes("abort") ||
      msg.includes("timeout")
    );
  }
  return false;
};

/**
 * Resilient fetch for Google APIs (Drive, Sheets, Userinfo).
 * - Automatic exponential backoff retry for network errors and 5xx/429
 * - Minimal headers (omits Content-Type on GET to avoid unnecessary preflights)
 * - Transparent fallback to /v1/sheets/proxy if direct connection fails (e.g. DNS / ERR_NAME_NOT_RESOLVED)
 */
export const resilientGoogleFetch = async (
  accessToken: string,
  url: string,
  options: GoogleFetchOptions = {},
): Promise<any> => {
  const { maxRetries = 2, useProxyFallback = true, ...init } = options;

  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...(init.headers as Record<string, string>),
  };

  // Only attach Content-Type if there is a body, preventing unnecessary CORS preflights on GET
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, {
        ...init,
        method,
        headers,
      });

      if (response.status === 401) {
        // Auth failure — do not retry, caller should refresh token or re-auth
        const body = await response.text().catch(() => "");
        const err = new Error(`Google API 401 Unauthorized: ${body}`);
        (err as any).status = 401;
        throw err;
      }

      // Retry on 429 or 5xx server errors
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        attempt++;
        const backoff = 350 * Math.pow(2, attempt) + Math.random() * 100;
        await sleep(backoff);
        continue;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const err = new Error(
          `Google API call failed (${response.status}) ${method} ${url}: ${body}`,
        );
        (err as any).status = response.status;
        throw err;
      }

      if (response.status === 204) return null;
      return response.json();
    } catch (err) {
      lastError = err;
      if (!isNetworkOrTransientError(err) || attempt >= maxRetries) {
        break;
      }
      attempt++;
      const backoff = 350 * Math.pow(2, attempt) + Math.random() * 100;
      await sleep(backoff);
    }
  }

  // If direct fetch failed with a network error and this is a Google Sheets call,
  // try the backend worker fallback proxy
  if (
    useProxyFallback &&
    url.startsWith("https://sheets.googleapis.com/") &&
    RECEIPT_API_KEY
  ) {
    try {
      const proxyRes = await client.v1.sheets.proxy.$post(
        {
          json: {
            url,
            method,
            body: init.body
              ? typeof init.body === "string"
                ? init.body
                : JSON.stringify(init.body)
              : undefined,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${RECEIPT_API_KEY}`,
            "X-Google-Token": accessToken,
          },
        },
      );

      if (proxyRes.ok) {
        if (proxyRes.status === 204) return null;
        return proxyRes.json();
      }

      const proxyBody = await proxyRes.text().catch(() => "");
      const err = new Error(
        `Google API call failed via proxy (${proxyRes.status}) ${method} ${url}: ${proxyBody}`,
      );
      (err as any).status = proxyRes.status;
      throw err;
    } catch (proxyErr) {
      if (proxyErr instanceof Error && !isNetworkOrTransientError(proxyErr)) {
        throw proxyErr;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};
