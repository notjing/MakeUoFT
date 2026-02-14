// ── gapless-audio.js ──────────────────────────────────────────────────────────
// Gapless playback engine for Lyria PCM chunks on React Native / Expo.
//
// Key fixes over v1:
//   1. playAsync() startup latency compensation via PLAY_LATENCY_MS
//   2. Deeper preload queue (not just 1 entry) so network jitter doesn't stall
//   3. advanceToNext fires early enough for the NEXT preload to begin loading
//      the chunk AFTER that — keeps the pipeline 2 entries deep at all times
//   4. Stall recovery: if preloaded entry isn't ready yet, we wait for it
//      with a tight poll instead of immediately awaiting a fresh load
//   5. bufferedCount replaced with queue.length checks to avoid drift
// ─────────────────────────────────────────────────────────────────────────────

import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";

const SAMPLE_RATE       = 48_000;
const CHANNELS          = 2;
const BYTES_PER_SAMPLE  = 2; // int16

// How many chunks to buffer before starting playback.
// 4 gives ~2–3 seconds of buffer at typical Lyria chunk sizes.
const CLIENT_BUFFER_SIZE = 4;

// How early before a chunk ends to fire advanceToNext().
// Must be long enough to: swap buffers + start the next sound's internal init.
// Too small → gap. Too large → you cut the chunk short.
const ADVANCE_LEAD_MS = 120;

// Compensation for expo-av's playAsync() internal startup latency.
// This is subtracted from the scheduled swap so the next sound starts
// outputting audio right as the previous one finishes.
// Tune up if you still hear a gap; tune down if you hear an overlap/click.
const PLAY_LATENCY_MS = 40;

// How long to wait (in ms) between polls when the preload slot isn't ready yet.
const STALL_POLL_MS = 10;

// ── state ─────────────────────────────────────────────────────────────────────
let queue         = [];   // pending b64 strings not yet loading
let preloadQueue  = [];   // { sound, path, durationMs } entries fully loaded
let activeEntry   = null; // currently playing entry
let scheduleTimer = null;
let running       = false;
let stopping      = false;

// ── helpers ───────────────────────────────────────────────────────────────────

function pcmDurationMs(pcmByteLength) {
  const samples = pcmByteLength / (CHANNELS * BYTES_PER_SAMPLE);
  return (samples / SAMPLE_RATE) * 1000;
}

async function b64PcmToWavUri(b64) {
  const pcm = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const s = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };

  s(0,  "RIFF"); v.setUint32(4,  36 + pcm.length, true);
  s(8,  "WAVE"); s(12, "fmt ");
  v.setUint32(16, 16, true);  v.setUint16(20, 1, true);
  v.setUint16(22, CHANNELS, true);  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, true);
  v.setUint16(32, CHANNELS * BYTES_PER_SAMPLE, true); v.setUint16(34, 16, true);
  s(36, "data"); v.setUint32(40, pcm.length, true);

  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header));
  wav.set(pcm, 44);

  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < wav.length; i += chunkSize) {
    binary += String.fromCharCode(...wav.subarray(i, i + chunkSize));
  }

  const path = `${FileSystem.cacheDirectory}ac_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`;
  await FileSystem.writeAsStringAsync(path, btoa(binary), { encoding: "base64" });
  return { path, durationMs: pcmDurationMs(pcm.length) };
}

async function loadEntry(b64) {
  try {
    const { path, durationMs } = await b64PcmToWavUri(b64);
    const { sound } = await Audio.Sound.createAsync(
      { uri: path },
      { shouldPlay: false, volume: 1.0 },
      null,
    );
    return { sound, path, durationMs };
  } catch (e) {
    console.warn("[audio] load error:", e);
    return null;
  }
}

// Kick off loading the next N chunks from the raw queue into preloadQueue.
// Call this whenever a slot opens up to keep the pipeline full.
function fillPreloadQueue() {
  // Keep up to 2 entries preloaded ahead at all times
  const TARGET_PRELOAD_DEPTH = 2;

  while (preloadQueue.length < TARGET_PRELOAD_DEPTH && queue.length > 0) {
    const b64 = queue.shift();
    // Push a Promise-like sentinel so we know a load is in flight.
    // When it resolves we'll push the real entry.
    const placeholder = { loading: true };
    preloadQueue.push(placeholder);

    loadEntry(b64).then((entry) => {
      if (stopping) {
        if (entry) cleanup(entry);
        return;
      }
      // Replace placeholder with the real entry
      const idx = preloadQueue.indexOf(placeholder);
      if (idx !== -1) {
        preloadQueue[idx] = entry ?? { error: true };
      }
    });
  }
}

// Wait until preloadQueue[0] is a fully loaded entry (not a placeholder).
async function waitForNextEntry() {
  while (true) {
    if (stopping) return null;
    if (preloadQueue.length === 0) {
      // Queue is empty — maybe more chunks will arrive, or we're done
      return null;
    }
    const head = preloadQueue[0];
    if (!head.loading && !head.error) return head;
    if (head.error) {
      preloadQueue.shift(); // skip bad entry
      continue;
    }
    // Still loading — poll
    await new Promise((r) => setTimeout(r, STALL_POLL_MS));
  }
}

async function playEntry(entry) {
  if (stopping || !entry) { running = false; return; }

  activeEntry = entry;

  try {
    await entry.sound.playAsync();
  } catch (e) {
    console.warn("[audio] playAsync error:", e);
    cleanup(entry);
    await advanceToNext(entry);
    return;
  }

  // Fire the swap early enough to account for:
  //   - buffer swap overhead (ADVANCE_LEAD_MS)
  //   - playAsync() startup latency on the next sound (PLAY_LATENCY_MS)
  const swapDelay = Math.max(0, entry.durationMs - ADVANCE_LEAD_MS - PLAY_LATENCY_MS);
  scheduleTimer = setTimeout(() => advanceToNext(entry), swapDelay);
}

async function advanceToNext(finishedEntry) {
  scheduleTimer = null;

  // Grab the next ready entry
  const next = await waitForNextEntry();

  if (next) {
    preloadQueue.shift(); // consume it
    fillPreloadQueue();   // immediately start loading the next one in line
  }

  // Clean up the finished chunk slightly after handing off audio to the next
  if (finishedEntry) {
    setTimeout(() => cleanup(finishedEntry), 300);
  }

  if (!next) {
    // Nothing left — go idle. enqueueChunk() will wake us if more arrive.
    running = false;
    return;
  }

  await playEntry(next);
}

function cleanup(entry) {
  if (!entry) return;
  entry.sound?.unloadAsync().catch(() => {});
  if (entry.path) {
    FileSystem.deleteAsync(entry.path, { idempotent: true }).catch(() => {});
  }
}

// ── public API ────────────────────────────────────────────────────────────────

function enqueueChunk(b64) {
  if (stopping) return;

  queue.push(b64);
  fillPreloadQueue(); // opportunistically start preloading

  const totalBuffered = queue.length + preloadQueue.length;

  // Wake up playback if it stalled waiting for more chunks
  if (running === false && activeEntry === null && totalBuffered >= CLIENT_BUFFER_SIZE) {
    startPlayback();
  }
}

async function startPlayback() {
  if (running || stopping) return;
  running = true;

  // Wait for the first entry to be ready
  const first = await waitForNextEntry();
  if (!first || stopping) { running = false; return; }

  preloadQueue.shift();
  fillPreloadQueue();

  await playEntry(first);
}

function clearAudio() {
  stopping = true;
  running  = false;

  clearTimeout(scheduleTimer);
  scheduleTimer = null;

  // Cleanup everything in flight
  if (activeEntry)  { cleanup(activeEntry);  activeEntry  = null; }
  for (const entry of preloadQueue) {
    if (entry && !entry.loading && !entry.error) cleanup(entry);
  }
  preloadQueue = [];
  queue        = [];

  setTimeout(() => { stopping = false; }, 50);
}

export { enqueueChunk, clearAudio };