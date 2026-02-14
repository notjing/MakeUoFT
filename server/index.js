import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createLyriaSession } from "./services/lyria.js";
import { SongConductor } from "./services/conductor.js"; // <--- Import the Conductor

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// Map to store active Conductors (socketId -> SongConductor instance)
const conductors = new Map();

io.on("connection", (socket) => {
  console.log(`[${socket.id}] connected`);

  socket.on("startMusic", async () => {
    // Prevent starting multiple sessions for the same socket
    if (conductors.has(socket.id)) return;

    try {
      // 1. Create the raw Lyria audio session
      // We still need the callbacks here to send audio chunks to the frontend
      const lyria = await createLyriaSession({
        onChunk: (base64) => socket.emit("audioChunk", base64),
        onError: (err)    => socket.emit("musicError", err?.message ?? String(err)),
        onClose: ()       => {
          // If Lyria dies unexpectedly, clean up the conductor
          const conductor = conductors.get(socket.id);
          if (conductor) {
            conductor.stop();
            conductors.delete(socket.id);
          }
          socket.emit("musicStopped");
        },
      });

      // 2. Initialize the Conductor with this socket and the Lyria session
      const conductor = new SongConductor(socket, lyria);
      
      // 3. Store it so we can stop it later
      conductors.set(socket.id, conductor);

      // 4. Start the show (The Conductor will pick the first section and start the timer)
      conductor.start();
      
      socket.emit("musicStarted");
      
    } catch (err) {
      console.error(`[${socket.id}] Failed to start:`, err);
      socket.emit("musicError", err?.message ?? String(err));
    }
  });

  socket.on("stopMusic", async () => {
    const conductor = conductors.get(socket.id);
    if (!conductor) return;
    
    // Stop the conductor (which stops the timer AND the Lyria session)
    conductor.stop();
    conductors.delete(socket.id);
    
    socket.emit("musicStopped");
  });

  socket.on("disconnect", async () => {
    const conductor = conductors.get(socket.id);
    if (conductor) {
      conductor.stop();
      conductors.delete(socket.id);
    }
    console.log(`[${socket.id}] disconnected`);
  });
});

httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));