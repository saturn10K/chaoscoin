export interface MoltbookAuthConfig {
  /** The Moltbook identity token endpoint */
  identityEndpoint?: string;
}

/**
 * Handles Moltbook identity token acquisition and auto-refresh.
 * Agents call acquireToken() to get a fresh identity token,
 * which is then sent to the Chaoscoin API for registration.
 */
export class MoltbookAuth {
  private identityEndpoint: string;
  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config?: MoltbookAuthConfig) {
    this.identityEndpoint =
      config?.identityEndpoint ??
      "https://moltbook.com/api/v1/agents/me/identity-token";
  }

  /**
   * Acquire a Moltbook identity token.
   * Tokens are valid for 1 hour; we cache for 50 minutes.
   */
  async acquireToken(apiKey: string): Promise<string> {
    // Return cached token if still valid
    if (this.cachedToken && Date.now() < this.tokenExpiry) {
      return this.cachedToken;
    }

    const response = await fetch(this.identityEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Moltbook auth failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as { identity_token: string };
    this.cachedToken = data.identity_token;
    this.tokenExpiry = Date.now() + 50 * 60 * 1000; // 50 minutes

    return this.cachedToken;
  }

  /**
   * Clear cached token (e.g., after receiving 401).
   */
  clearCache(): void {
    this.cachedToken = null;
    this.tokenExpiry = 0;
  }

  /**
   * Check if we have a valid cached token.
   */
  hasValidToken(): boolean {
    return this.cachedToken !== null && Date.now() < this.tokenExpiry;
  }
}
