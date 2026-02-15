import { io } from "socket.io-client";
import dotenv from "dotenv";

const SOCKET_IP = "https://conanima.pynekoyne.com";

//triggers the "connection" 
export const socket = io(SOCKET_IP, {
})