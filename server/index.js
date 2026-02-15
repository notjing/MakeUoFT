import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { registerSocketHandlers } from "./services/webSockets.js";
import fs from "fs";

dotenv.config();

// 1. Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// 2. Serve static files from the 'public' folder
// Make sure this folder exists at the root level of your project
app.use(express.static(path.join(__dirname, "public")));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

registerSocketHandlers(io);

// 3. Handle SPA (React/Vue) routing
// This must be placed AFTER your API routes (if any) but BEFORE the listen command
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));