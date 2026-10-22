import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Training Hub",
    short_name: "Training",
    description: "HYROX prediction, fitness progress and training-load advice",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1014",
    theme_color: "#0d1014",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
