// services/socketHandler.js
import { createLyriaSession } from "./lyria.js"; 
import { SongConductor } from "./conductor.js";  
import { 
    handleUserUpdate, 
    handleBioUpdate, 
    handleCameraContext,
    generateSongPackage 
} from "../data/songStructure.js"; 

let print_counter = 0
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

    socket.on("camera_data", (data) => {
        console.log(`[${socket.id}] Camera data received:`, data);

        // Ignore empty/invalid data
        if (!data || (Object.keys(data).length === 0)) return;

        handleCameraContext(data);

        // Broadcast camera data to ALL waiting conductors
        let anyStarted = false;
        for (const [socketId, conductor] of conductors.entries()) {
            if (conductor.isWaitingForCamera) {
                console.log(`[${socketId}] Camera data broadcast received. UNMUTING and STARTING.`);

                // 1. Generate the band based on this new camera data
                const initialPackage = generateSongPackage();
                if (initialPackage.activeInstruments) {
                    conductor.socket.emit("activeBand", initialPackage.activeInstruments);
                }

                // 2. Unmute the audio gate
                conductor.isWaitingForCamera = false;

                // 3. Start the conductor logic
                conductor.start();

                anyStarted = true;
            }
        }

        // 4. Tell all Frontends to turn Blue if any conductor started
        if (anyStarted) {
            io.emit("musicStarted");
        }
    });

    socket.on("receiveBioPacket", (packet) => {
        print_counter += 1
        if (print_counter > 10) {
            console.log(`[${socket.id}] 10 Bio Packets Received:`, packet);
            print_counter = 0
        }
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