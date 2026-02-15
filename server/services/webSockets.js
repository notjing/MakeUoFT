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
      if (initialData) handleUserUpdate(initialData);
      if (conductors.has(socket.id)) return;

      try {
        // 1. Create the Audio Session with a "Gate"
        const lyria = await createLyriaSession({
          onChunk: (base64) => {
            // --- THE GATE ---
            // We fetch the conductor associated with this socket.
            const conductor = conductors.get(socket.id);

            // If the conductor doesn't exist yet, or is strictly waiting, 
            // we SILENTLY DROP the audio chunk. 
            if (!conductor || conductor.isWaitingForCamera) {
                return; 
            }

            // Otherwise, send the audio to the client
            socket.emit("audioChunk", base64);
          },
          onError: (err) => socket.emit("musicError", err?.message ?? String(err)),
          onClose: () => {
            handleCleanup(socket.id);
            socket.emit("musicStopped");
          },
        });

        // 2. Initialize the Conductor
        const conductor = new SongConductor(socket, lyria);
        
        // 3. Set the "Waiting" flag to TRUE immediately
        conductor.isWaitingForCamera = true;
        conductors.set(socket.id, conductor);
        
        console.log(`[${socket.id}] Engine initialized. MUTED until camera data arrives...`);

      } catch (err) {
        console.error(`[${socket.id}] Failed to start:`, err);
        socket.emit("musicError", err?.message ?? String(err));
      }
    });

    // --- Camera Context Handler (The Trigger) ---
    socket.on("receiveCameraContext", (data) => {
        const conductor = conductors.get(socket.id);
        if (!conductor) return;

        // Ignore empty/invalid data
        if (!data || (Object.keys(data).length === 0)) return;

        handleCameraContext(data);

        // CHECK: Are we currently waiting/muted?
        if (conductor.isWaitingForCamera) {
            console.log(`[${socket.id}] Camera data received. UNMUTING and STARTING.`);
            
            // 1. Generate the band based on this new camera data
            const initialPackage = generateSongPackage(); 
            if (initialPackage.activeInstruments) {
                socket.emit("activeBand", initialPackage.activeInstruments);
            }

            // 2. Unmute the audio gate
            conductor.isWaitingForCamera = false;

            // 3. Start the conductor logic
            conductor.start(); 
            
            // 4. Tell Frontend to turn Blue
            socket.emit("musicStarted");

        } else {
            // Already playing, just update instruments
            if (data.instruments) {
                socket.emit("activeBand", data.instruments);
            }
        }
    });

    socket.on("receiveBioPacket", (packet) => {
        const conductor = conductors.get(socket.id);
        if (conductor && !conductor.isWaitingForCamera) {
            handleBioUpdate(packet, conductor);
        }
    });

    socket.on("updateSession", (data) => {
      const conductor = conductors.get(socket.id);
      handleUserUpdate(data);
      if (conductor && !conductor.isWaitingForCamera) {
          conductor.updateUserSpecs(); 
      }
    });

    socket.on("stopMusic", () => {
      handleCleanup(socket.id);
      socket.emit("musicStopped");
    });

    socket.on("start", () => { io.emit("start"); });
    socket.on("stop", () => { io.emit("stop"); });

    socket.on("disconnect", () => {
      handleCleanup(socket.id);
      console.log(`[${socket.id}] disconnected`);
    });
  });
};

function handleCleanup(socketId) {
  const conductor = conductors.get(socketId);
  if (conductor) {
    conductor.stop();
    conductors.delete(socketId);
  }
}