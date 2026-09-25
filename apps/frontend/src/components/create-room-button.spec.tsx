import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateRoomButton } from "./create-room-button";
import type { RoomState } from "@/lib/room-types";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

class FakeSocket {
  handlers = new Map<string, (payload?: unknown) => void>();
  emitted: { event: string; payload: unknown }[] = [];
  disconnected = false;

  on(event: string, handler: (payload?: unknown) => void) {
    this.handlers.set(event, handler);
  }

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
  }

  disconnect() {
    this.disconnected = true;
  }

  triggerConnect() {
    this.handlers.get("connect")?.();
  }

  triggerRoomState(state: RoomState) {
    this.handlers.get("room_state")?.(state);
  }
}

let lastSocket: FakeSocket | null = null;

vi.mock("@/lib/socket", () => ({
  createSocket: () => {
    lastSocket = new FakeSocket();
    return lastSocket;
  },
}));

describe("CreateRoomButton", () => {
  afterEach(() => {
    lastSocket = null;
    pushMock.mockReset();
    vi.restoreAllMocks();
  });

  it("emite create_room al hacer click y redirige al recibir room_state", async () => {
    render(<CreateRoomButton />);

    fireEvent.click(screen.getByRole("button", { name: /crear sala/i }));
    lastSocket?.triggerConnect();

    expect(lastSocket?.emitted).toContainEqual({
      event: "create_room",
      payload: undefined,
    });

    lastSocket?.triggerRoomState({
      code: "ABCDE",
      status: "lobby",
      players: [],
      teams: [],
      round: null,
      currentGame: null,
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/screen/ABCDE");
    });
    expect(lastSocket?.disconnected).toBe(true);
  });

  it("deshabilita el botón mientras crea la sala", () => {
    render(<CreateRoomButton />);

    fireEvent.click(screen.getByRole("button", { name: /crear sala/i }));

    expect(screen.getByRole("button", { name: /creando sala/i })).toBeDisabled();
  });
});
