import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite que `apps/e2e` compile a una carpeta aparte (`.next-e2e`) sin
  // pisar el `.next` de un `next dev` que pueda estar corriendo en paralelo.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  // Next.js bloquea por defecto los requests cross-origin al dev server
  // (HMR, chunks, RSC) salvo que el origen esté acá — solo permite
  // `localhost` de entrada. Esta app se abre desde la IP LAN de la
  // laptop/TV (los celulares no pueden usar `localhost`), así que hay que
  // permitir explícitamente los rangos típicos de router doméstico.
  // Ref: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
