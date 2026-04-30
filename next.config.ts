import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Subimos a 6 MB para que quepa un comprobante de 5 MB (MAX_PROOF_BYTES)
      // más el overhead de serialización del FormData.
      bodySizeLimit: "6mb",
    },
  },
  images: {
    // Permite que `next/image` optimice comprobantes que vienen del bucket
    // `payment-proofs` de Supabase Storage. Cuando los productos también
    // se alojen en Storage (deuda D07-A), esta entrada los cubre también.
    // Si en el futuro se usa Cloudinary o similar para imágenes de
    // productos, agregar el dominio acá y quitar `unoptimized` de los
    // componentes correspondientes.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;
