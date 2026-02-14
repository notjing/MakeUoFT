// services/socketHandler.js
import { createLyriaSession } from "../services/lyria.js";
import { SongConductor } from "../services/conductor.js";

// Keep state local to this module
const conductors = new Map();

export const registerSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log(`[${socket.id}] connected`);

    // --- Start Music Handler ---
    socket.on("startMusic", async () => {
      if (conductors.has(socket.id)) return;

      try {
        const lyria = await createLyriaSession({
          onChunk: (base64) => socket.emit("audioChunk", base64),
          onError: (err) => socket.emit("musicError", err?.message ?? String(err)),
          onClose: () => {
            handleCleanup(socket.id);
            socket.emit("musicStopped");
          },
        });

        const conductor = new SongConductor(socket, lyria);
        conductors.set(socket.id, conductor);
        conductor.start();
        
        socket.emit("musicStarted");
      } catch (err) {
        console.error(`[${socket.id}] Failed to start:`, err);
        socket.emit("musicError", err?.message ?? String(err));
      }
    });

    // --- Stop Music Handler ---
    socket.on("stopMusic", () => {
      handleCleanup(socket.id);
      socket.emit("musicStopped");
    });

    // --- Disconnect Handler ---
    socket.on("disconnect", () => {
      handleCleanup(socket.id);
      console.log(`[${socket.id}] disconnected`);
    });
  });
};

// Helper to keep logic DRY
function handleCleanup(socketId) {
  const conductor = conductors.get(socketId);
  if (conductor) {
    conductor.stop();
    conductors.delete(socketId);
  }
}