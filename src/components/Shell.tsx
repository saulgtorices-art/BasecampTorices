"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Table2,
  Columns3,
  UserCheck,
  Users,
  Building2,
  LogOut,
  UsersRound,
} from "lucide-react";
import clsx from "clsx";
import type { Miembro } from "@/types/db";
import { DatosProvider, useDatos } from "@/components/datos/DatosProvider";
import PanelTarea from "@/components/panel/PanelTarea";
import BarraTemporizador from "@/components/tiempo/BarraTemporizador";

const NAV = [
  { href: "/tabla", texto: "Tabla", icono: Table2 },
  { href: "/kanban", texto: "Kanban", icono: Columns3 },
  { href: "/mis-tareas", texto: "Mis tareas", icono: UserCheck },
  { href: "/responsables", texto: "Por responsable", icono: UsersRound },
  { href: "/dashboard", texto: "Dashboard", icono: LayoutDashboard },
];

const NAV_ADMIN = [
  { href: "/clientes", texto: "Clientes", icono: Building2 },
  { href: "/equipo", texto: "Equipo", icono: Users },
];

export default function Shell({ yo, children }: { yo: Miembro; children: React.ReactNode }) {
  const ruta = usePathname();

  const enlace = (n: (typeof NAV)[number]) => {
    const Icono = n.icono;
    const activo = ruta.startsWith(n.href);
    return (
      <Link
        key={n.href}
        href={n.href}
        className={clsx(
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
          activo ? "bg-marca-50 font-medium text-marca-700" : "text-slate-600 hover:bg-slate-100",
        )}
      >
        <Icono size={17} />
        <span className="hidden md:inline">{n.texto}</span>
      </Link>
    );
  };

  return (
    <DatosProvider yo={yo}>
    <div className="flex h-full">
      <aside className="flex w-14 shrink-0 flex-col border-r border-slate-200 bg-white md:w-56">
        <div className="flex items-center gap-2 px-3 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-marca-600 text-sm font-bold text-white">
            BT
          </div>
          <span className="hidden font-semibold md:inline">Basecamp Torices</span>
          <IndicadorEnLinea />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV.map(enlace)}
          <div className="mt-4 mb-1 hidden px-3 text-[11px] font-semibold tracking-wide text-slate-400 uppercase md:block">
            Catálogos
          </div>
          {NAV_ADMIN.map(enlace)}
        </nav>
        <div className="border-t border-slate-200 p-2">
          <div className="hidden px-2 pb-2 md:block">
            <div className="truncate text-sm font-medium">{yo.nombre}</div>
            <div className="truncate text-xs text-slate-500">
              {yo.correo} · {yo.rol}
            </div>
          </div>
          <form action="/auth/salir" method="post">
            <button className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              <LogOut size={17} />
              <span className="hidden md:inline">Salir</span>
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
    <PanelTarea />
    <BarraTemporizador />
    </DatosProvider>
  );
}

function IndicadorEnLinea() {
  const { enLinea } = useDatos();
  return (
    <span
      title={enLinea ? "En tiempo real" : "Sin conexión en tiempo real"}
      className={clsx("ml-auto hidden h-2 w-2 shrink-0 rounded-full md:block", enLinea ? "bg-green-500" : "bg-slate-300")}
    />
  );
}
