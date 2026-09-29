import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoomClosedNotice } from "./room-closed-notice";

describe("RoomClosedNotice", () => {
  it("explica que el anfitrión se fue cuando el motivo es host_left", () => {
    render(<RoomClosedNotice reason="host_left" />);

    expect(screen.getByText("El anfitrión se desconectó y la sala se cerró.")).toBeInTheDocument();
  });

  it("explica la duración máxima cuando el motivo es max_age", () => {
    render(<RoomClosedNotice reason="max_age" />);

    expect(screen.getByText("La sala llegó a su duración máxima y se cerró.")).toBeInTheDocument();
  });

  it("ofrece volver al inicio", () => {
    render(<RoomClosedNotice reason="host_left" />);

    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });
});
