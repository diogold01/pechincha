import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import PwaRegistrar from "@/components/PwaRegistrar";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pechincha — Controle de Compras",
  description:
    "Controle total das compras de mercado, histórico de preços e orçamento por setor.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pechincha",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#3B4CCA",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={plusJakartaSans.variable}>
      <body className="antialiased selection:bg-primary-light selection:text-primary-hover">
        <PwaRegistrar />
        {children}
      </body>
    </html>
  );
}
