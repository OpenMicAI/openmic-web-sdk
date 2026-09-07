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

// Keep the key in your env/config, e.g. import.meta.env.VITE_OPENMIC_PUBLIC_KEY
// (Vite) or process.env.NEXT_PUBLIC_OPENMIC_KEY (Next.js)
const openmic = new OpenMicClient(OPENMIC_PUBLIC_KEY);
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

## Post-call data and agent management

This SDK deliberately covers only what is safe to run in a browser with a public key: registering and joining web calls. Everything that needs a secret key stays on your server:

- **Post-call data** — store `call.call_id` when you start the call, then fetch `GET /v2/call/{call_id}` from your backend for the transcript, recording URL, and analysis (or receive the post-call webhook).
- **Creating and updating agents** — `POST /v2/agents` / `PATCH /v2/agents/{uid}` from your backend.

A server SDK covering these is planned; until then use the REST API directly.

## Script tag (no build step)

```html
<script src="https://unpkg.com/@openmic/web-sdk@latest/dist/web-sdk.standalone.global.js"></script>
<script>
  const { OpenMicClient, OpenMicWebClient } = OpenMicSDK;
</script>
```

## License

MIT
