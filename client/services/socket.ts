import { io } from "socket.io-client";

const SOCKET_IP = "http://172.20.10.4:5000";

//triggers the "connection" 
export const socket = io(SOCKET_IP, {
    autoConnect: true,
})