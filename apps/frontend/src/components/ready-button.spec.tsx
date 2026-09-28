import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReadyButton } from "./ready-button";

describe("ReadyButton", () => {
  it("llama onReady una sola vez ante clics repetidos", () => {
    const onReady = vi.fn();
    render(<ReadyButton onReady={onReady} pressed={false} readyCount={0} totalCount={2} />);

    const button = screen.getByRole("button", { name: /listo/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("muestra el conteo de listos tras presionar", () => {
    const onReady = vi.fn();
    render(<ReadyButton onReady={onReady} pressed={false} readyCount={0} totalCount={3} />);

    fireEvent.click(screen.getByRole("button", { name: /listo/i }));

    expect(screen.getByText(/esperando a los demás \(0\/3\)/i)).toBeInTheDocument();
  });

  it("con pressed=true desde el inicio, ya muestra el botón deshabilitado y el conteo", () => {
    const onReady = vi.fn();
    render(<ReadyButton onReady={onReady} pressed={true} readyCount={1} totalCount={2} />);

    expect(screen.getByRole("button", { name: /listo/i })).toBeDisabled();
    expect(screen.getByText(/esperando a los demás \(1\/2\)/i)).toBeInTheDocument();
  });

  it("cuando todos están listos, no renderiza nada", () => {
    const onReady = vi.fn();
    const { container } = render(
      <ReadyButton onReady={onReady} pressed={true} readyCount={2} totalCount={2} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
