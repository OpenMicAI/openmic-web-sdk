# @openmic/web-sdk

Browser SDK for [OpenMic](https://openmic.ai) web calls. Build voice experiences with your own UI — an AI interviewer, an in-app assistant, a support line — with live transcription, call controls, and per-call dynamic variables.

## Install

```bash
npm install @openmic/web-sdk
```

## How it works

Starting a web call is two steps, like placing a phone call:

1. **Your backend registers the call** with `OpenMicClient.createWebCall` (wraps `POST /v2/create-web-call`), using your API key. It returns an `access_token`, the `livekit_url` to connect to, and the `call_id` you'll use to fetch the transcript and recording afterwards. Hand the first two to the browser.
2. **The browser joins** with `OpenMicWebClient.startCall`.

**Your API key never leaves your server.** The browser only ever receives the `access_token` — a single-room LiveKit credential that expires in 15 minutes and can't call the OpenMic API.

## Quickstart

Server side (e.g. an Express/Next.js route):

```ts
import { OpenMicClient } from "@openmic/web-sdk";

const openmic = new OpenMicClient(process.env.OPENMIC_API_KEY);

// Per-call dynamic variables personalize the prompt
const call = await openmic.createWebCall({
  agent_uid: "your-agent-uid",
  dynamic_variables: {
    candidate_name: "Ada",
    role: "Senior Backend Engineer",
  },
  customer_id: "attempt-42", // your own id, echoed on the call record
});

// Store call.call_id against your session, then return to the browser:
// { access_token: call.access_token, livekit_url: call.livekit_url }
```

Browser side:

```ts
import { OpenMicWebClient } from "@openmic/web-sdk";

const webClient = new OpenMicWebClient();
const { access_token, livekit_url } = await fetch("/api/interview/start", {
  method: "POST",
}).then((res) => res.json());

// Call from a click handler so audio is unlocked
await webClient.startCall({
  accessToken: access_token,
  livekitUrl: livekit_url,
});
```

After the call, back on the server:

```ts
const details = await openmic.getCall(callId);
// details.transcript, details.recording_url, details.call_analysis
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

`OpenMicClient` wraps the OpenMic v2 REST API — server-side, same API key:

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
