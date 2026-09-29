import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HostDisconnectedBanner } from "./host-disconnected-banner";

describe("HostDisconnectedBanner", () => {
  it("avisa que el anfitrión perdió la conexión, como región de estado", () => {
    render(<HostDisconnectedBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "El anfitrión perdió la conexión. Esperando a que vuelva…",
    );
  });
});
