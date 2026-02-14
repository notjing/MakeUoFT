// ── gapless-audio.js ──────────────────────────────────────────────────────────
// Replaces the per-chunk file-write + didJustFinish chain with duration-based
// scheduling, eliminating the ~100ms polling gap between chunks.
//
// Strategy:
//   1. Convert b64 PCM → WAV in memory (no disk until play time)
//   2. Track "expectedFinishAt" using wall-clock time + chunk duration
//   3. Fire playNext() via setTimeout(delay) instead of waiting for didJustFinish
//   4. Overlap load time: start loading chunk N+1 the moment chunk N begins playing
// ─────────────────────────────────────────────────────────────────────────────

import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2; // int16

// How many chunks to pre-buffer before starting playback.
// Lower = less initial latency, but more risk of underrun.
const CLIENT_BUFFER_SIZE = 6;

// How many ms before a chunk ends to kick off the next load.
// Tune down if you hear gaps; tune up if you hear overlaps.
const PRELOAD_LEAD_MS = 80;

// ── state (module-level singletons) ──────────────────────────────────────────
let queue = [];            // pending b64 strings
let activeEntry = null;    // { sound, path, durationMs }
let preloadedEntry = null; // already loaded, waiting to play
let scheduleTimer = null;  // setTimeout handle for next swap
let bufferedCount = 0;
let running = false;
let stopping = false;

// ── helpers ───────────────────────────────────────────────────────────────────

/** Returns duration of a raw PCM payload in milliseconds. */
function pcmDurationMs(pcmByteLength) {
  const samples = pcmByteLength / (CHANNELS * BYTES_PER_SAMPLE);
  return (samples / SAMPLE_RATE) * 1000;
}

/** Build a WAV file in memory and write it once to cache. */
async function b64PcmToWavUri(b64) {
  const pcm = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const s = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  s(0,  "RIFF");  v.setUint32(4,  36 + pcm.length, true);
  s(8,  "WAVE");  s(12, "fmt ");
  v.setUint32(16, 16, true);  v.setUint16(20, 1, true);
  v.setUint16(22, CHANNELS, true);  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, true);
  v.setUint16(32, CHANNELS * BYTES_PER_SAMPLE, true);  v.setUint16(34, 16, true);
  s(36, "data");  v.setUint32(40, pcm.length, true);

  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header));
  wav.set(pcm, 44);

  // base64-encode the complete WAV for FileSystem
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < wav.length; i += chunk) {
    binary += String.fromCharCode(...wav.subarray(i, i + chunk));
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
      null,           // no status callback — we schedule by time instead
    );
    return { sound, path, durationMs };
  } catch (e) {
    console.warn("[audio] load error:", e);
    return null;
  }
}

async function startPlayback() {
  if (running || stopping) return;

  // Pop from front of queue (already has CLIENT_BUFFER_SIZE chunks)
  const b64 = queue.shift();
  if (!b64) return;

  running = true;

  // Load the first chunk; simultaneously preload the second
  const entry = await loadEntry(b64);
  if (!entry || stopping) { running = false; return; }

  if (queue.length > 0) {
    const nextB64 = queue.shift();
    loadEntry(nextB64).then((e) => { if (!stopping) preloadedEntry = e; });
  }

  await playEntry(entry);
}

async function playEntry(entry) {
  if (stopping || !entry) { running = false; return; }

  activeEntry = entry;

  try {
    await entry.sound.playAsync();
  } catch (e) {
    console.warn("[audio] playAsync error:", e);
    cleanup(entry);
    advanceToNext();
    return;
  }

  // Schedule the swap PRELOAD_LEAD_MS before this chunk ends.
  // This gives us time to start loading the chunk after next while
  // the preloaded one is already sitting in memory.
  const swapDelay = Math.max(0, entry.durationMs - PRELOAD_LEAD_MS);
  scheduleTimer = setTimeout(() => advanceToNext(entry), swapDelay);
}

async function advanceToNext(finishedEntry) {
  scheduleTimer = null;

  // Swap in the preloaded entry immediately (no disk I/O here)
  const next = preloadedEntry;
  preloadedEntry = null;

  // Start loading the one after that in parallel
  if (queue.length > 0) {
    const b64 = queue.shift();
    loadEntry(b64).then((e) => { if (!stopping) preloadedEntry = e; });
  }

  // Clean up finished chunk slightly after handing off
  if (finishedEntry) {
    setTimeout(() => cleanup(finishedEntry), 200);
  }

  if (!next) {
    // Nothing preloaded — fall back to loading from queue or stall
    if (queue.length > 0) {
      const b64 = queue.shift();
      const entry = await loadEntry(b64);
      await playEntry(entry);
    } else {
      // Queue empty; pause until enqueueChunk() wakes us up
      running = false;
    }
    return;
  }

  await playEntry(next);
}

function cleanup(entry) {
  if (!entry) return;
  entry.sound.unloadAsync().catch(() => {});
  FileSystem.deleteAsync(entry.path, { idempotent: true }).catch(() => {});
}

// ── public API ────────────────────────────────────────────────────────────────

function enqueueChunk(b64) {
  if (stopping) return;
  bufferedCount++;
  queue.push(b64);

  // If we're running and the preload slot is free, fill it now
  if (running && !preloadedEntry && queue.length === 1) {
    const next = queue.shift();
    loadEntry(next).then((e) => { if (!stopping) preloadedEntry = e; });
  }

  // Start playback once we've buffered enough chunks
  if (!running && bufferedCount >= CLIENT_BUFFER_SIZE) {
    startPlayback();
  }
}

function clearAudio() {
  stopping = true;
  running = false;
  bufferedCount = 0;
  queue = [];

  clearTimeout(scheduleTimer);
  scheduleTimer = null;

  if (activeEntry) { cleanup(activeEntry); activeEntry = null; }
  if (preloadedEntry) { cleanup(preloadedEntry); preloadedEntry = null; }

  // Reset stopping flag after a tick so enqueueChunk works again next session
  setTimeout(() => { stopping = false; }, 50);
}

export { enqueueChunk, clearAudio };    