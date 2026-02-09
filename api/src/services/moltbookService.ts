import { config } from "../config";
import { MoltbookVerifyResponse, CachedIdentity } from "../types";

const CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes
const identityCache = new Map<string, CachedIdentity>();

// Clean expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of identityCache) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      identityCache.delete(token);
    }
  }
}, 5 * 60 * 1000);

export async function verifyIdentity(
  identityToken: string
): Promise<MoltbookVerifyResponse | null> {
  // Check cache first
  const cached = identityCache.get(identityToken);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { valid: true, agent: cached.agent };
  }

  try {
    const response = await fetch(
      "https://moltbook.com/api/v1/agents/verify-identity",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.moltbookAppKey}`,
        },
        body: JSON.stringify({ identity_token: identityToken }),
      }
    );

    if (!response.ok) {
      console.error(
        `Moltbook verify failed: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = (await response.json()) as MoltbookVerifyResponse;

    if (data.valid && data.agent) {
      identityCache.set(identityToken, {
        agent: data.agent,
        cachedAt: Date.now(),
      });
    }

    return data;
  } catch (err) {
    console.error("Moltbook verify error:", err);
    return null;
  }
}

export function clearCache(): void {
  identityCache.clear();
}
