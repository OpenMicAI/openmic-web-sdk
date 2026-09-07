import { WebCall } from "./types";

const DEFAULT_BASE_URL = "https://api.openmic.ai";

export interface CreateWebCallRequest {
  agent_uid: string;
  customer_id?: string;
  dynamic_variables?: Record<string, string>;
}

export class OpenMicError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenMicError";
  }
}

/**
 * Registers web calls with the OpenMic API. Safe to use in browsers with your
 * public key (omic_pub_...), or from your backend.
 *
 * Everything beyond starting a web call — managing agents, reading call logs,
 * transcripts, and recordings — requires a secret key and belongs on your
 * server, not in this SDK.
 */
export class OpenMicClient {
  private baseUrl: string;

  constructor(
    private apiKey: string,
    options?: { baseUrl?: string },
  ) {
    this.baseUrl = (options?.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  /** Register a web call and get the access token + LiveKit URL for the browser to join with */
  async createWebCall(request: CreateWebCallRequest): Promise<WebCall> {
    const response = await fetch(`${this.baseUrl}/v2/create-web-call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      try {
        const data = await response.json();
        if (data && typeof data.error === "string") message = data.error;
      } catch {
        // non-JSON error body
      }
      throw new OpenMicError(response.status, message);
    }

    return (await response.json()) as WebCall;
  }
}
