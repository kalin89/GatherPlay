import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CreateTeamForm } from "./create-team-form";
import { TEAM_COLORS } from "@/lib/team-colors";

describe("CreateTeamForm", () => {
  it("el botón está deshabilitado sin nombre", () => {
    render(<CreateTeamForm onCreate={vi.fn()} />);

    expect(screen.getByRole("button", { name: /agregar equipo/i })).toBeDisabled();
  });

  it("llama a onCreate con el nombre recortado y el primer color por defecto", () => {
    const onCreate = vi.fn();
    render(<CreateTeamForm onCreate={onCreate} />);

    fireEvent.change(screen.getByPlaceholderText("Nombre del equipo"), {
      target: { value: "  Rojos  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /agregar equipo/i }));

    expect(onCreate).toHaveBeenCalledWith("Rojos", TEAM_COLORS[0]);
  });

  it("permite elegir otro color antes de enviar", () => {
    const onCreate = vi.fn();
    render(<CreateTeamForm onCreate={onCreate} />);

    fireEvent.change(screen.getByPlaceholderText("Nombre del equipo"), {
      target: { value: "Azules" },
    });
    fireEvent.click(screen.getByLabelText(`Elegir color ${TEAM_COLORS[1]}`));
    fireEvent.click(screen.getByRole("button", { name: /agregar equipo/i }));

    expect(onCreate).toHaveBeenCalledWith("Azules", TEAM_COLORS[1]);
  });

  it("limpia el formulario después de enviar", () => {
    render(<CreateTeamForm onCreate={vi.fn()} />);
    const input = screen.getByPlaceholderText("Nombre del equipo") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "Rojos" } });
    fireEvent.click(screen.getByRole("button", { name: /agregar equipo/i }));

    expect(input.value).toBe("");
  });
});
