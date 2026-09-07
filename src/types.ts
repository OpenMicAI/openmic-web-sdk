export interface StartCallConfig {
  /** LiveKit access token from the create-web-call response */
  accessToken: string;
  /** LiveKit server URL from the create-web-call response */
  livekitUrl: string;
  /** Sample rate for audio capture */
  sampleRate?: number;
  /** Specific device id for audio capture */
  captureDeviceId?: string;
  /** Specific device id for audio playback */
  playbackDeviceId?: string;
  /** Emit raw float32 audio samples of the agent audio (e.g. for visualizations). Default false. */
  emitRawAudioSamples?: boolean;
}

export interface TranscriptMessage {
  role: "agent" | "user";
  content: string;
}

export interface UpdateEvent {
  event_type: "update";
  /** Full running transcript of the call so far, oldest first */
  transcript: TranscriptMessage[];
}

export interface NodeTransitionEvent {
  event_type: "node_transition";
  nodeName?: string;
  nodeType?: string;
}

export type OpenMicWebClientEvents = {
  call_started: () => void;
  call_ready: () => void;
  call_ended: () => void;
  agent_start_talking: () => void;
  agent_stop_talking: () => void;
  update: (event: UpdateEvent) => void;
  node_transition: (event: NodeTransitionEvent) => void;
  audio: (samples: Float32Array) => void;
  error: (message: string) => void;
};

export interface WebCall {
  call_type: "webcall";
  call_id: string;
  agent_uid: string;
  access_token: string;
  livekit_url: string;
  call_status: "registered";
  direction: "inbound";
  customer_id?: string;
  dynamic_variables?: Record<string, string>;
}
