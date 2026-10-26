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
  Ticket,
  Network,
  ScanSearch,
} from "lucide-react";
import clsx from "clsx";
import type { Miembro } from "@/types/db";
import { DatosProvider, useDatos } from "@/components/datos/DatosProvider";
import PanelTarea from "@/components/panel/PanelTarea";
import BarraTemporizador from "@/components/tiempo/BarraTemporizador";
import Campana from "@/components/notificaciones/Campana";
import Avatar from "@/components/ui/Avatar";

const NAV = [
  { href: "/tabla", texto: "Tabla", icono: Table2 },
  { href: "/kanban", texto: "Kanban", icono: Columns3 },
  { href: "/mis-tareas", texto: "Mis tareas", icono: UserCheck },
  { href: "/tickets", texto: "Tickets", icono: Ticket },
  { href: "/responsables", texto: "Por responsable", icono: UsersRound },
  { href: "/dashboard", texto: "Dashboard", icono: LayoutDashboard },
  { href: "/auditorias", texto: "Auditorías UX/UI", icono: ScanSearch },
];

// Solo coordinadores (admin): dashboard de su célula.
const NAV_LIDER = [{ href: "/mi-celula", texto: "Mi célula", icono: Network }];

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
    <div className="flex h-full print:block print:h-auto">
      <aside className="flex w-14 print:hidden shrink-0 flex-col border-r border-slate-200 bg-white md:w-56">
        <div className="flex items-center gap-2 px-3 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-simbolo.png" alt="Grupo Torices" width={36} height={19} className="h-auto w-9 shrink-0" />
          <div className="hidden min-w-0 leading-tight md:block">
            <div className="truncate font-semibold">Grupo Torices</div>
            <div className="text-xs text-slate-500">Marketing</div>
          </div>
          <IndicadorEnLinea />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          <Campana />
          <div className="my-1 border-t border-slate-100" />
          {NAV.map(enlace)}
          {yo.rol === "admin" && NAV_LIDER.map(enlace)}
          <div className="mt-4 mb-1 hidden px-3 text-[11px] font-semibold tracking-wide text-slate-400 uppercase md:block">
            Catálogos
          </div>
          {NAV_ADMIN.map(enlace)}
        </nav>
        <div className="border-t border-slate-200 p-2">
          <MiPerfil />
          <form action="/auth/salir" method="post">
            <button className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              <LogOut size={17} />
              <span className="hidden md:inline">Salir</span>
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto print:overflow-visible">{children}</main>
    </div>
    <PanelTarea />
    <BarraTemporizador />
    </DatosProvider>
  );
}

function MiPerfil() {
  const { yo } = useDatos();
  const ruta = usePathname();
  return (
    <Link
      href="/perfil"
      title="Mi perfil"
      className={clsx(
        "mb-1 flex items-center gap-2.5 rounded-md px-2 py-2",
        ruta.startsWith("/perfil") ? "bg-marca-50" : "hover:bg-slate-100",
      )}
    >
      <Avatar nombre={yo.nombre} foto={yo.foto_url} tam={32} />
      <div className="hidden min-w-0 md:block">
        <div className="truncate text-sm font-medium">{yo.nombre}</div>
        <div className="truncate text-xs text-slate-500">{yo.puesto || yo.correo}</div>
      </div>
    </Link>
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
