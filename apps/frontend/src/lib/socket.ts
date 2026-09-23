import { io, type Socket } from "socket.io-client";

// Fábrica aislada para poder sustituirla por un doble en las pruebas
// (los componentes nunca importan `socket.io-client` directamente).
export function createSocket(): Socket {
  const url = process.env.NEXT_PUBLIC_WS_URL ?? "";
  return io(url, { transports: ["websocket"] });
}
