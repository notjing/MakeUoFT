import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createLyriaSession } from "./services/lyria.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// socketId → { stop: () => Promise<void> }
const sessions = new Map();

io.on("connection", (socket) => {
  console.log(`[${socket.id}] connected`);

  socket.on("startMusic", async () => {
    if (sessions.has(socket.id)) return; // already running

    try {
      const lyria = await createLyriaSession({
        onChunk: (base64) => socket.emit("audioChunk", base64),
        onError: (err)   => socket.emit("musicError", err?.message ?? String(err)),
        onClose: ()      => {
          sessions.delete(socket.id);
          socket.emit("musicStopped");
        },
      });

      sessions.set(socket.id, lyria);
      socket.emit("musicStarted");
    } catch (err) {
      console.error(`[${socket.id}] Failed to start Lyria:`, err);
      socket.emit("musicError", err?.message ?? String(err));
    }
  });

  socket.on("stopMusic", async () => {
    const lyria = sessions.get(socket.id);
    if (!lyria) return;
    sessions.delete(socket.id);
    await lyria.stop();
    socket.emit("musicStopped");
  });

  socket.on("disconnect", async () => {
    const lyria = sessions.get(socket.id);
    if (lyria) {
      sessions.delete(socket.id);
      await lyria.stop();
    }
    console.log(`[${socket.id}] disconnected`);
  });
});

httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));