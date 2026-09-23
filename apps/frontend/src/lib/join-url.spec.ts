import { afterEach, describe, expect, it, vi } from "vitest";
import { buildJoinUrl } from "./join-url";

describe("buildJoinUrl", () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalEnv;
    vi.unstubAllGlobals();
  });

  it("usa NEXT_PUBLIC_APP_URL cuando está definida", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://192.168.1.100:3000";

    expect(buildJoinUrl("ABCDE")).toBe("http://192.168.1.100:3000/play/ABCDE");
  });

  it("cae a window.location.origin cuando no está definida", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });

    expect(buildJoinUrl("ABCDE")).toBe("http://localhost:3000/play/ABCDE");
  });

  it("no duplica la barra si NEXT_PUBLIC_APP_URL termina en /", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://192.168.1.100:3000/";

    expect(buildJoinUrl("ABCDE")).toBe("http://192.168.1.100:3000/play/ABCDE");
  });
});
