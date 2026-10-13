import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SCRIPT_TEMA } from "@/lib/temaScript";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Basecamp Torices", template: "%s · Basecamp Torices" },
  description: "Tablero de tareas del equipo de Desarrollo Web de Grupo Torices",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1018" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
