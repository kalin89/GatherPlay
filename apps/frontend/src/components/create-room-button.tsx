"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSocket } from "@/lib/socket";
import type { RoomState } from "@/lib/room-types";
import styles from "./create-room-button.module.css";

export function CreateRoomButton({ className }: { className?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "creating" | "failed">("idle");

  function handleClick() {
    setStatus("creating");
    const socket = createSocket();

    socket.on("connect", () => {
      socket.emit("create_room");
    });

    socket.on("room_state", (room: RoomState) => {
      // El socket que crea la sala no es el que la pantalla usará (ésta
      // abre el suyo propio vía `watch_room` en /screen/[roomCode]) — la
      // sala vive en memoria en el backend, así que sobrevive a esta
      // desconexión y a la navegación.
      socket.disconnect();
      router.push(`/screen/${room.code}`);
    });

    socket.on("connect_error", () => {
      setStatus("failed");
      socket.disconnect();
    });
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={className}
        onClick={handleClick}
        disabled={status === "creating"}
      >
        {status === "creating" ? "Creando sala…" : "Crear sala"}
      </button>
      {status === "failed" && (
        <p className={styles.error}>
          No pudimos conectar con el servidor. Probá de nuevo.
        </p>
      )}
    </div>
  );
}
