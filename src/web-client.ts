import { EventEmitter } from "eventemitter3";
import {
  ConnectionState,
  Participant,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  TranscriptionSegment,
  createAudioAnalyser,
} from "livekit-client";

import {
  OpenMicWebClientEvents,
  StartCallConfig,
  TranscriptMessage,
} from "./types";

const TRANSCRIPTION_TOPIC = "lk.transcription";
const CHAT_TOPIC = "lk.chat";
const WORKFLOW_TOPIC = "workflow";
const AGENT_STATE_ATTRIBUTE = "lk.agent.state";
const SEGMENT_ID_ATTRIBUTE = "lk.segment_id";

interface TranscriptSegment {
  role: "agent" | "user";
  content: string;
}

export class OpenMicWebClient extends EventEmitter<OpenMicWebClientEvents> {
  private room?: Room;
  private connected = false;
  private agentAudioReady = false;
  private usesAgentStateAttribute = false;
  private segments = new Map<string, TranscriptSegment>();
  private decoder = new TextDecoder();

  public isAgentTalking = false;

  public analyzerComponent?: {
    calculateVolume: () => number;
    analyser: AnalyserNode;
    cleanup: () => Promise<void>;
  };
  private captureAudioFrame?: number;

  public async startCall(config: StartCallConfig): Promise<void> {
    try {
      this.room = new Room({
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          deviceId: config.captureDeviceId,
          sampleRate: config.sampleRate,
        },
        audioOutput: {
          deviceId: config.playbackDeviceId,
        },
      });

      this.handleRoomEvents();
      this.handleAudioEvents(config);
      this.handleTranscriptionEvents();
      this.handleDataEvents();

      if (!config.livekitUrl) {
        throw new Error(
          "livekitUrl is required — pass livekit_url from the create-web-call response",
        );
      }
      await this.room.connect(config.livekitUrl, config.accessToken);

      await this.room.localParticipant.setMicrophoneEnabled(true);
      this.connected = true;
      this.emit("call_started");
    } catch (err) {
      this.emit("error", "Error starting call");
      console.error("[openmic-web-sdk] Error starting call", err);
      this.stopCall();
    }
  }

  /**
   * Some browsers block audio playback before a user gesture.
   * Call from a click/tap handler to unlock playback.
   */
  public async startAudioPlayback(): Promise<void> {
    await this.room?.startAudio();
  }

  public stopCall(): void {
    if (!this.room) return;
    const wasConnected = this.connected;
    this.connected = false;
    this.agentAudioReady = false;
    this.isAgentTalking = false;
    this.usesAgentStateAttribute = false;
    this.segments.clear();

    if (wasConnected) {
      this.emit("call_ended");
    }
    this.room.disconnect();
    this.room = undefined;

    if (this.analyzerComponent) {
      this.analyzerComponent.cleanup();
      this.analyzerComponent = undefined;
    }
    if (this.captureAudioFrame !== undefined) {
      window.cancelAnimationFrame(this.captureAudioFrame);
      this.captureAudioFrame = undefined;
    }
  }

  public mute(): void {
    if (this.connected) {
      this.room?.localParticipant.setMicrophoneEnabled(false);
    }
  }

  public unmute(): void {
    if (this.connected) {
      this.room?.localParticipant.setMicrophoneEnabled(true);
    }
  }

  public isMuted(): boolean {
    if (!this.connected || !this.room) return false;
    return !this.room.localParticipant.isMicrophoneEnabled;
  }

  /**
   * Inject a text message into the conversation as a user turn.
   * The agent responds to it the same way it responds to speech.
   */
  public async sendTextMessage(text: string): Promise<void> {
    if (!this.connected || !this.room) {
      throw new Error("Cannot send message: call is not connected");
    }
    await this.room.localParticipant.sendText(text, { topic: CHAT_TOPIC });
  }

  /** Full running transcript of the call so far */
  public getTranscript(): TranscriptMessage[] {
    return Array.from(this.segments.values(), ({ role, content }) => ({
      role,
      content,
    }));
  }

  private handleRoomEvents(): void {
    if (!this.room) return;

    this.room.on(RoomEvent.Disconnected, () => {
      this.stopCall();
    });

    this.room.on(
      RoomEvent.ConnectionStateChanged,
      (state: ConnectionState) => {
        if (state === ConnectionState.Disconnected && this.connected) {
          this.stopCall();
        }
      },
    );

    this.room.on(
      RoomEvent.ParticipantAttributesChanged,
      (changed: Record<string, string>, participant: Participant) => {
        if (participant.isLocal) return;
        const state = changed[AGENT_STATE_ATTRIBUTE];
        if (!state) return;
        this.usesAgentStateAttribute = true;
        this.setAgentTalking(state === "speaking");
      },
    );

    // Fallback speaking detection for agents that do not publish state attributes
    this.room.on(
      RoomEvent.ActiveSpeakersChanged,
      (speakers: Participant[]) => {
        if (this.usesAgentStateAttribute) return;
        this.setAgentTalking(speakers.some((speaker) => !speaker.isLocal));
      },
    );
  }

  private setAgentTalking(talking: boolean): void {
    if (talking === this.isAgentTalking) return;
    this.isAgentTalking = talking;
    this.emit(talking ? "agent_start_talking" : "agent_stop_talking");
  }

  private handleAudioEvents(config: StartCallConfig): void {
    if (!this.room) return;

    this.room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        _publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (
          track.kind !== Track.Kind.Audio ||
          !(track instanceof RemoteAudioTrack)
        ) {
          return;
        }

        if (this.isAgentParticipant(participant) && !this.agentAudioReady) {
          this.agentAudioReady = true;
          this.emit("call_ready");

          if (config.emitRawAudioSamples) {
            this.analyzerComponent = createAudioAnalyser(track);
            this.captureAudioFrame = window.requestAnimationFrame(() =>
              this.captureAudioSamples(),
            );
          }
        }

        track.attach();
      },
    );
  }

  private handleTranscriptionEvents(): void {
    if (!this.room) return;

    const localIdentity = () => this.room?.localParticipant.identity;

    // Live transcription via text streams (current agents protocol)
    this.room.registerTextStreamHandler(
      TRANSCRIPTION_TOPIC,
      async (reader, participantInfo) => {
        try {
          const content = await reader.readAll();
          const attributes = reader.info.attributes ?? {};
          const segmentId =
            attributes[SEGMENT_ID_ATTRIBUTE] || reader.info.id;
          const role =
            participantInfo.identity === localIdentity() ? "user" : "agent";
          this.upsertSegment(segmentId, role, content);
        } catch (err) {
          console.error("[openmic-web-sdk] Error reading transcription", err);
        }
      },
    );

    // Legacy transcription events, deduped by segment id
    this.room.on(
      RoomEvent.TranscriptionReceived,
      (segments: TranscriptionSegment[], participant?: Participant) => {
        const role =
          participant && participant.identity === localIdentity()
            ? "user"
            : "agent";
        for (const segment of segments) {
          this.upsertSegment(segment.id, role, segment.text);
        }
      },
    );
  }

  private upsertSegment(
    segmentId: string,
    role: "agent" | "user",
    content: string,
  ): void {
    if (!content) return;
    const existing = this.segments.get(segmentId);
    if (existing && existing.content === content) return;
    if (existing) {
      existing.content = content;
    } else {
      this.segments.set(segmentId, { role, content });
    }
    this.emit("update", {
      event_type: "update",
      transcript: this.getTranscript(),
    });
  }

  private handleDataEvents(): void {
    if (!this.room) return;

    this.room.on(
      RoomEvent.DataReceived,
      (payload: Uint8Array, _participant, _kind, topic?: string) => {
        if (topic !== WORKFLOW_TOPIC) return;
        try {
          const event = JSON.parse(this.decoder.decode(payload));
          if (event.type === "node_active") {
            this.emit("node_transition", {
              event_type: "node_transition",
              nodeName: event.nodeName,
              nodeType: event.nodeType,
            });
          }
        } catch (err) {
          console.error("[openmic-web-sdk] Error decoding data message", err);
        }
      },
    );
  }

  private isAgentParticipant(participant: RemoteParticipant): boolean {
    return participant.isAgent || !participant.identity.startsWith("monitor-");
  }

  private captureAudioSamples(): void {
    if (!this.connected || !this.analyzerComponent) return;
    const bufferLength = this.analyzerComponent.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    this.analyzerComponent.analyser.getFloatTimeDomainData(dataArray);
    this.emit("audio", dataArray);
    this.captureAudioFrame = window.requestAnimationFrame(() =>
      this.captureAudioSamples(),
    );
  }
}
