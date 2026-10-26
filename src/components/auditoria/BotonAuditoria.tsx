"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ScanSearch } from "lucide-react";
import clsx from "clsx";
import { useDatos } from "@/components/datos/DatosProvider";

/** Lanza una auditoría y devuelve su id (o null si falló, ya avisado). */
export function useGenerarAuditoria() {
  const { avisar } = useDatos();
  const router = useRouter();
  const [generando, setGenerando] = useState(false);

  async function generar(clienteId: string, url?: string) {
    setGenerando(true);
    try {
      const r = await fetch("/api/auditorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: clienteId, url: url?.trim() || undefined }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.id) {
        avisar(json.error ?? "No se pudo iniciar la auditoría.");
        return null;
      }
      router.push(`/auditorias/${json.id}`);
      return json.id as string;
    } finally {
      setGenerando(false);
    }
  }

  return { generar, generando };
}

export default function BotonAuditoria({
  clienteId,
  dominio,
  compacto,
}: {
  clienteId: string;
  dominio: string | null;
  compacto?: boolean;
}) {
  const { generar, generando } = useGenerarAuditoria();
  const sinDominio = !dominio?.trim();
  return (
    <button
      type="button"
      disabled={generando || sinDominio}
      title={sinDominio ? "Agrega el dominio del cliente para auditarlo" : `Auditar ${dominio}`}
      onClick={() => generar(clienteId)}
      className={clsx(compacto ? "btn-secundario px-2 py-1 text-xs" : "btn-primario")}
    >
      {generando ? <LoaderCircle size={14} className="animate-spin" /> : <ScanSearch size={14} />}
      {compacto ? "Auditar" : "Generar auditoría UX/UI"}
    </button>
  );
}
