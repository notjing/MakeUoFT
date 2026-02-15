// services/socketHandler.js
import { createLyriaSession } from "./lyria.js";
import { SongConductor } from "./conductor.js";
import { 
    handleUserUpdate, 
    handleBioUpdate, 
    handleCameraContext,
    generateSongPackage
} from "../data/songStructure.js";

const conductors = new Map();

export const registerSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log(`[${socket.id}] connected`);

    // --- Start Music Handler ---
    socket.on("startMusic", async (initialData) => {
      // 1. If user sent initial settings, apply them first
      if (initialData) {
        handleUserUpdate(initialData);
      }

      if (conductors.has(socket.id)) return;

      try {
        // 2. Create the Audio Session
        const lyria = await createLyriaSession({
          onChunk: (base64) => socket.emit("audioChunk", base64),
          onError: (err) => socket.emit("musicError", err?.message ?? String(err)),
          onClose: () => {
            handleCleanup(socket.id);
            socket.emit("musicStopped");
          },
        });

        // 3. Initialize the Conductor
        const conductor = new SongConductor(socket, lyria);

        // --- NEW LOGIC: PAUSE FOR CAMERA ---
        // We set a flag indicating this session is ready but waiting for eyes/camera
        conductor.isWaitingForCamera = true;
        conductors.set(socket.id, conductor);
        
        console.log(`[${socket.id}] Initialized. Waiting for camera context to start...`);
        
        // NOTE: We do NOT call conductor.start() or emit "musicStarted" yet.
        // The frontend will remain in the "CONNECTING" (Yellow) state.

      } catch (err) {
        console.error(`[${socket.id}] Failed to start:`, err);
        socket.emit("musicError", err?.message ?? String(err));
      }
    });

    // --- Bio Data Handler ---
    socket.on("receiveBioPacket", (packet) => {
        console.log(`[${socket.id}] Received bio packet:`, packet);
        const conductor = conductors.get(socket.id);

        if (!conductor) {
            // console.warn(`[${socket.id}] Received bio packet but no active conductor.`);
            return;
        }

        // Pass the conductor so the bio handler can influence the current song
        handleBioUpdate(packet, conductor);
    });

    // --- Camera Context Handler (The Trigger) ---
    socket.on("receiveCameraContext", (data) => {
        const conductor = conductors.get(socket.id);

        // If we don't have a conductor yet (user hasn't pressed start), ignore or store logic
        if (!conductor) return;

        // Apply camera insights to the song structure
        handleCameraContext(data);

        // 2. CHECK: Are we waiting to start?
        if (conductor.isWaitingForCamera) {
            console.log(`[${socket.id}] Camera context received. Starting music now.`);

            // Clear the flag so we don't restart on the next frame
            conductor.isWaitingForCamera = false;

            // Generate the first package now that we have the camera data (Genre/Mood/etc)
            const initialPackage = generateSongPackage();

            // Tell Frontend what instruments were picked based on the camera
            if (initialPackage.activeInstruments) {
                socket.emit("activeBand", initialPackage.activeInstruments);
            }

            // Start the actual music flow
            conductor.start();
            socket.emit("musicStarted"); // This flips the frontend to "STREAMING" (Blue)
        } else {
            // Already playing? Just update instruments if the camera changed them
            if (data.instruments) {
                socket.emit("activeBand", data.instruments);
            }
        }
    });

    // --- User UI Update Handler ---
    socket.on("updateSession", (data) => {
      const conductor = conductors.get(socket.id);
      if (conductor && !conductor.isWaitingForCamera) {
          handleUserUpdate(data);
          conductor.updateUserSpecs();
      }
    });

    // --- Stop Music Handler ---
    socket.on("stopMusic", () => {
      handleCleanup(socket.id);
      socket.emit("musicStopped");
    });

    socket.on("camera_status", (status) => {
        console.log(`[${socket.id}] Camera status: ${status}`);
    })

      socket.on("camera_data", (data) => {
        console.log(`[${socket.id}] Camera data received:`, data);
      })

    socket.on("start", () => {
        console.log(`[${socket.id}] start command received`);
      io.emit("start");
      console.log("STARTED")
    })

    socket.on("stop", () => {
      io.emit("stop");
      console.log("STOPPED")
    })

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