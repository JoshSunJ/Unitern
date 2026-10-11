import type { Metadata } from "next";
import localFont from "next/font/local";
import Footer from "@/components/Footer";
import HousingChat from "@/components/HousingChat";
import { Suspense } from "react";
import "./globals.css";
import "./design.css";
import "./housing-chat.css";
import "maplibre-gl/dist/maplibre-gl.css";

const figtree = localFont({
  src: "./fonts/Figtree-variable.ttf",
  variable: "--font-interface",
  display: "swap",
  weight: "300 900",
});
const garamond = localFont({
  src: [
    { path: "./fonts/EBGaramond-normal.woff2", style: "normal", weight: "400 800" },
    { path: "./fonts/EBGaramond-italic.woff2", style: "italic", weight: "400 800" },
  ],
  variable: "--font-editorial",
  display: "swap",
});

export const metadata: Metadata = {
  title: "unitern | Housing that works with where you're going",
  description: "Find student and intern housing around the places and commutes that matter.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body id="top" className={`${figtree.variable} ${garamond.variable}`}>
        {children}
        <Footer />
        <Suspense fallback={null}><HousingChat /></Suspense>
      </body>
    </html>
  );
}
