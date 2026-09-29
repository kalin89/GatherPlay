import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ObjectGrid } from "./object-grid";

const ITEMS = Array.from({ length: 4 }, (_, i) => ({
  id: `obj-${i}`,
  imagenUrl: `https://example.com/${i}.svg`,
}));

describe("ObjectGrid", () => {
  it("renderiza una imagen por objeto, sin ninguna palabra visible", () => {
    const { container, queryByText } = render(<ObjectGrid items={ITEMS} remainingSeconds={30} />);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(4);
    for (const [i, img] of images.entries()) {
      expect(img).toHaveAttribute("src", ITEMS[i]!.imagenUrl);
      expect(img).toHaveAttribute("alt", "");
    }
    expect(queryByText(/./)).toBeNull();
  });

  it("en el tramo grid (remainingSeconds > 20) posiciona con top/left, sin la clase de desvanecido", () => {
    const { container } = render(<ObjectGrid items={ITEMS} remainingSeconds={25} />);
    const item = container.querySelector("img")!.parentElement!;
    expect(item.style.top).not.toBe("");
    expect(item.style.left).not.toBe("");
    expect(item.className).not.toMatch(/fadeout/);
  });

  it("en el tramo orbit (remainingSeconds entre 6 y 10) usa el contenedor de dos capas", () => {
    const { container } = render(<ObjectGrid items={ITEMS} remainingSeconds={8} />);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(4);
    // La capa interior (padre de la imagen) es distinta de la capa que gira
    // (abuelo) — confirma la estructura de dos niveles.
    const inner = images[0]!.parentElement!;
    const wrapper = inner.parentElement!;
    expect(wrapper).not.toBe(inner);
    expect(inner.getAttribute("style")).toContain("animation");
    expect(wrapper.getAttribute("style")).toContain("animation");
  });

  it("en el tramo fadeout (remainingSeconds <= 5) agrega la clase de desvanecido", () => {
    const { container } = render(<ObjectGrid items={ITEMS} remainingSeconds={3} />);
    const item = container.querySelector("img")!.parentElement!;
    expect(item.className).toMatch(/fadeout/);
  });
});
