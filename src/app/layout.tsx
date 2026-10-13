import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Basecamp Torices",
  description: "Tablero de tareas del equipo de Desarrollo Web de Grupo Torices",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX">
      <body className="antialiased">{children}</body>
    </html>
  );
}
