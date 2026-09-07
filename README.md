# @openmic/web-sdk

Browser SDK for [OpenMic](https://openmic.ai) web calls. Build voice experiences with your own UI — an AI interviewer, an in-app assistant, a support line — with live transcription, call controls, and per-call dynamic variables.

## Install

```bash
npm install @openmic/web-sdk
```

## How it works

Starting a web call is two steps, like placing a phone call:

1. **Register the call** with `POST /v2/create-web-call` (or `OpenMicClient.createWebCall`). This returns an `access_token`, the `livekit_url` to connect to, and the `call_id` you'll use to fetch the transcript and recording afterwards.
2. **Join from the browser** with `OpenMicWebClient.startCall`.

For production apps, do step 1 from your backend so you control who can start calls; for prototypes you can do both in the browser with your public key (`omic_pub_...`).

## Quickstart

```ts
import { OpenMicClient, OpenMicWebClient } from "@openmic/web-sdk";

const openmic = new OpenMicClient("omic_pub_...");
const webClient = new OpenMicWebClient();

// 1. Register the call — per-call dynamic variables personalize the prompt
const call = await openmic.createWebCall({
  agent_uid: "your-agent-uid",
  dynamic_variables: {
    candidate_name: "Ada",
    role: "Senior Backend Engineer",
  },
  customer_id: "attempt-42", // your own id, echoed on the call record
});

// 2. Join from the browser (call from a click handler so audio is unlocked)
await webClient.startCall({
  accessToken: call.access_token,
  livekitUrl: call.livekit_url,
});

// 3. After the call: transcript, recording, analysis
const details = await openmic.getCall(call.call_id);
```

The variables are substituted into the agent prompt wherever it says `{{candidate_name}}` / `{{role}}`, so one durable agent serves every call.

## Events

```ts
webClient.on("call_started", () => {});        // connected, mic on
webClient.on("call_ready", () => {});          // agent audio is up — hide your loader
webClient.on("call_ended", () => {});
webClient.on("agent_start_talking", () => {});
webClient.on("agent_stop_talking", () => {});
webClient.on("update", (e) => {
  // e.transcript: full running transcript, oldest first
  // [{ role: "agent" | "user", content: "..." }, ...]
});
webClient.on("error", (message) => {});

// Workflow agents only: fires when the conversation moves between nodes
webClient.on("node_transition", (e) => {});

// With startCall({ emitRawAudioSamples: true }): raw Float32Array agent
// audio samples for visualizations
webClient.on("audio", (samples) => {});
```

## Controls

```ts
webClient.stopCall();
webClient.mute();
webClient.unmute();
webClient.isMuted();
webClient.getTranscript();               // same shape as the update event
await webClient.sendTextMessage("...");  // inject a typed user turn mid-call
await webClient.startAudioPlayback();    // call from a tap handler if autoplay is blocked
```

`startCall` also accepts `sampleRate`, `captureDeviceId`, `playbackDeviceId`, and `emitRawAudioSamples`.

## Managing agents and calls

`OpenMicClient` wraps the OpenMic v2 REST API — use it server-side with a private key to manage agents:

```ts
const agent = await openmic.createAgent({
  name: "Interviewer",
  prompt: "You are interviewing {{candidate_name}} for the {{role}} position...",
});

await openmic.updateAgent(agent.uid, { prompt: "..." });
await openmic.getAgent(agent.uid);
await openmic.deleteAgent(agent.uid);

await openmic.listCalls({ agent_uid: agent.uid, call_type: "webcall" });
await openmic.getCall(callId);
```

## Script tag (no build step)

```html
<script src="https://unpkg.com/@openmic/web-sdk@latest/dist/web-sdk.standalone.global.js"></script>
<script>
  const { OpenMicClient, OpenMicWebClient } = OpenMicSDK;
</script>
```

## License

MIT
