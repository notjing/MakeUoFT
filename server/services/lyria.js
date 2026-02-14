import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: "v1alpha",
});

export async function createLyriaSession({ onChunk, onError, onClose }) {
  let chunkCount = 0;
  let lastChunkAt = Date.now();
  let stalledTimer = null;

  const session = await client.live.music.connect({
    model: "models/lyria-realtime-exp",
    callbacks: {
      onmessage: (message) => {
        if (message.serverContent?.audioChunks) {
          for (const chunk of message.serverContent.audioChunks) {
            if (!chunk.data) continue;
            chunkCount++;
            lastChunkAt = Date.now();
            console.log(`🎵 Chunk #${chunkCount}, size: ${chunk.data.length} chars`);
            onChunk(chunk.data);
          }
        }
      },
      onerror: (error) => {
        console.error("❌ Lyria error:", error);
        clearInterval(stalledTimer);
        onError?.(error);
      },
      onclose: () => {
        console.log("🔴 Lyria stream closed.");
        clearInterval(stalledTimer);
        onClose?.();
      },
    },
  });

  await session.setWeightedPrompts({
    weightedPrompts: [{ text: "very standard pop music", weight: 1.0 }],
  });

  await session.setMusicGenerationConfig({
    musicGenerationConfig: { bpm: 120, temperature: 1.5 },
  });

  await session.play();
  console.log("✅ Lyria: play called, waiting for audio...");

  // Detect if the stream stalls (no chunks for >5s) and log it
  stalledTimer = setInterval(() => {
    const msSinceLast = Date.now() - lastChunkAt;
    if (chunkCount > 0 && msSinceLast > 5000) {
      console.warn(`⚠️  No chunk received for ${Math.round(msSinceLast / 1000)}s (last was chunk #${chunkCount})`);
    }
  }, 2000);

  return {
    stop: async () => {
      console.log("⏹️  Stopping Lyria session...");
      clearInterval(stalledTimer);
      try { await session.close(); } catch (_) {}
    },
  };
}