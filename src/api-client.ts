import { WebCall } from "./types";

const DEFAULT_BASE_URL = "https://api.openmic.ai";

export interface AgentConfig {
  name?: string;
  prompt?: string;
  first_message?: string;
  auto_first_message?: boolean;
  voice_provider?: string;
  voice?: string;
  voice_model?: string;
  voice_language?: string;
  llm_model_name?: string;
  llm_model_temperature?: number;
  stt_provider?: string;
  stt_model?: string;
  stt_languages?: string[];
  boosted_keywords?: string[];
  post_call_webhook_url?: string;
  pre_call_webhook_url?: string;
  call_settings?: Record<string, unknown>;
  advanced_settings?: Record<string, unknown>;
  post_call_settings?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Agent extends AgentConfig {
  uid: string;
}

export interface Call {
  call_type: "phonecall" | "webcall";
  call_id: string;
  agent_uid: string;
  call_status: "registered" | "ongoing" | "ended" | "error";
  from_number: string;
  to_number: string;
  direction: "inbound" | "outbound";
  customer_id?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  transcript?: [string, string][];
  recording_url?: string;
  call_analysis?: Record<string, unknown>;
  dynamic_variables?: Record<string, string>;
  [key: string]: unknown;
}

export interface ListCallsQuery {
  page_size?: number;
  cursor?: string;
  customer_id?: string;
  agent_uid?: string;
  from_date?: string;
  to_date?: string;
  call_status?: "registered" | "ongoing" | "ended" | "error";
  call_type?: "phonecall" | "webcall";
}

export interface ListCallsResult {
  calls: Call[];
  has_more: boolean;
  next_cursor?: string;
}

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
 * Thin client for the OpenMic v2 API. Works in browsers and Node 18+.
 * Use a public key (omic_pub_...) in browsers; keep private keys server-side.
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
    return this.request("POST", "/v2/create-web-call", request);
  }

  async createAgent(config: AgentConfig): Promise<Agent> {
    return this.request("POST", "/v2/agents", config);
  }

  async getAgent(uid: string): Promise<Agent> {
    return this.request("GET", `/v2/agents/${encodeURIComponent(uid)}`);
  }

  async updateAgent(uid: string, config: AgentConfig): Promise<Agent> {
    return this.request(
      "PATCH",
      `/v2/agents/${encodeURIComponent(uid)}`,
      config,
    );
  }

  async deleteAgent(uid: string): Promise<void> {
    await this.request("DELETE", `/v2/agents/${encodeURIComponent(uid)}`);
  }

  /** Fetch a completed call's transcript, recording URL, and analysis */
  async getCall(callId: string): Promise<Call> {
    return this.request("GET", `/v2/call/${encodeURIComponent(callId)}`);
  }

  async listCalls(query?: ListCallsQuery): Promise<ListCallsResult> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) params.set(key, String(value));
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request("GET", `/v2/calls${suffix}`);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
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

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
