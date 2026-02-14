import { io } from "socket.io-client";
import dotenv from "dotenv";

const SOCKET_IP = process.env.URL;

//triggers the "connection" 
export const socket = io(SOCKET_IP, {
    autoConnect: true,
})