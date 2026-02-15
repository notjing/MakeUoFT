// services/socketHandler.js
import { createLyriaSession } from "./lyria.js"; // Ensure path is correct
import { SongConductor } from "./conductor.js";  // Ensure path is correct
import { 
    handleUserUpdate, 
    handleBioUpdate, 
    handleCameraContext,
    generateSongPackage // We need this to get the initial random band
} from "../data/songStructure.js"; // Adjusted import based on your previous files

// Keep state local to this module
const conductors = new Map();

export const registerSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log(`[${socket.id}] connected`);

    // --- Start Music Handler ---
    socket.on("startMusic", async (initialData) => {
      // 1. If user sent initial settings (instruments/genres/moods), apply them first
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
        conductors.set(socket.id, conductor);
        
        // 4. Generate the first song package to see what instruments were picked
        // Note: Your conductor.start() likely calls generateSongPackage internally.
        // We need to capture that result or just call it here to get the band data.
        const initialPackage = generateSongPackage(); 
        
        // 5. Tell the Frontend what instruments were actually picked (Feedback Loop)
        if (initialPackage.activeInstruments) {
            socket.emit("activeBand", initialPackage.activeInstruments);
        }

        // 6. Start the music flow
        conductor.start(); 
        
        socket.emit("musicStarted");

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

    // --- Camera Context Handler ---
    socket.on("receiveCameraContext", (data) => {
        const conductor = conductors.get(socket.id);
        if (!conductor) return;

        // Apply camera insights to the song structure
        handleCameraContext(data);
        
        // Optional: If camera changes instruments, notify frontend immediately
        if (data.instruments) {
            socket.emit("activeBand", data.instruments);
        }
    });

    // --- User UI Update Handler ---
    socket.on("updateSession", (data) => {
      console.log(`[${socket.id}] User updated session:`, data);
      
      // 1. Update the global state in songStructure.js
      handleUserUpdate(data);

      // 2. Trigger the timeline regeneration for THIS specific user
      const conductor = conductors.get(socket.id);
      if (conductor) {
          conductor.updateUserSpecs(); 
          console.log(`[${socket.id}] Timeline regenerated with new specs.`);
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
    })

    socket.on("stop", () => {
        console.log(`[${socket.id}] stop command received`);
        io.emit("stop");
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