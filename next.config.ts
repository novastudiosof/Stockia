import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Por defecto el límite es 1 MB y fallaba cualquier adjunto mayor. Vercel
      // acepta hasta 4,5 MB por petición, así que se deja un poco por debajo.
      bodySizeLimit: "4.4mb",
    },
  },
};

export default nextConfig;
