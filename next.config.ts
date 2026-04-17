import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Subimos a 6 MB para que quepa un comprobante de 5 MB (MAX_PROOF_BYTES)
      // más el overhead de serialización del FormData.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
