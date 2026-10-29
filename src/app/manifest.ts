import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pechincha — Controle de Compras de Mercado",
    short_name: "Pechincha",
    description:
      "Controle total das compras de mercado, carrinho ao vivo a dois, histórico de preços e orçamento mensal por setor.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F4F5F9",
    theme_color: "#3B4CCA",
    lang: "pt-BR",
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
