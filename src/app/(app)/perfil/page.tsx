"use client";

import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import Encabezado from "@/components/Encabezado";
import Avatar from "@/components/ui/Avatar";
import { useDatos } from "@/components/datos/DatosProvider";
import { supabaseNavegador } from "@/lib/supabase/client";

const TIPOS = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 2 * 1024 * 1024;

export default function PerfilPage() {
  const { yo, guardarMiPerfil, avisar } = useDatos();
  const supabase = supabaseNavegador();
  const archivoRef = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState(yo.nombre);
  const [puesto, setPuesto] = useState(yo.puesto ?? "");
  const [telefono, setTelefono] = useState(yo.telefono ?? "");
  const [foto, setFoto] = useState<string | null>(yo.foto_url);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cambios =
    nombre.trim() !== yo.nombre ||
    (puesto.trim() || null) !== (yo.puesto ?? null) ||
    (telefono.trim() || null) !== (yo.telefono ?? null) ||
    foto !== yo.foto_url;

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (!TIPOS.includes(archivo.type)) return avisar("Usa una imagen PNG, JPG, WEBP o GIF.");
    if (archivo.size > MAX_BYTES) return avisar("La imagen debe pesar menos de 2 MB.");

    setSubiendo(true);
    const ext = archivo.name.split(".").pop()?.toLowerCase() || "png";
    const ruta = `${yo.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("avatares")
      .upload(ruta, archivo, { contentType: archivo.type, upsert: true });
    setSubiendo(false);
    if (error) return avisar(error.message);

    const { data } = supabase.storage.from("avatares").getPublicUrl(ruta);
    setFoto(data.publicUrl);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return avisar("El nombre no puede quedar vacío.");
    setGuardando(true);
    const fotoAnterior = yo.foto_url;
    const ok = await guardarMiPerfil({
      nombre: nombre.trim(),
      puesto: puesto.trim() || null,
      telefono: telefono.trim() || null,
      foto_url: foto,
    });
    setGuardando(false);
    if (!ok) return;
    avisar("Perfil actualizado.", "ok");

    // Borra la foto anterior del bucket si se reemplazó o se quitó.
    const marca = "/object/public/avatares/";
    if (fotoAnterior && fotoAnterior !== foto && fotoAnterior.includes(marca)) {
      const rutaAnterior = decodeURIComponent(fotoAnterior.split(marca)[1]);
      await supabase.storage.from("avatares").remove([rutaAnterior]);
    }
  }

  return (
    <>
      <Encabezado titulo="Mi perfil" subtitulo="Así te ve el resto del equipo." />
      <form onSubmit={guardar} className="max-w-xl space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
          <Avatar nombre={nombre || yo.nombre} foto={foto} tam={80} />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => archivoRef.current?.click()}
                disabled={subiendo}
                className="btn-primario inline-flex items-center gap-1.5"
              >
                <Camera size={15} />
                {subiendo ? "Subiendo…" : foto ? "Cambiar foto" : "Subir foto"}
              </button>
              {foto && (
                <button
                  type="button"
                  onClick={() => setFoto(null)}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                >
                  <Trash2 size={15} />
                  Quitar
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">PNG, JPG, WEBP o GIF · máximo 2 MB.</p>
            <input ref={archivoRef} type="file" accept={TIPOS.join(",")} onChange={subirFoto} hidden />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="campo" required />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Puesto</span>
            <input
              value={puesto}
              onChange={(e) => setPuesto(e.target.value)}
              placeholder="Ej. Community Manager"
              className="campo"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Teléfono</span>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej. 55 1234 5678"
              className="campo"
            />
          </label>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="mb-1 block font-medium">Correo</span>
              <span className="text-slate-500">{yo.correo}</span>
            </div>
            <div>
              <span className="mb-1 block font-medium">Rol</span>
              <span className="text-slate-500 capitalize">{yo.rol}</span>
            </div>
          </div>
          <p className="text-xs text-slate-400">El correo y el rol solo los cambia un administrador.</p>
        </div>

        <button className="btn-primario" disabled={!cambios || guardando || subiendo}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>
    </>
  );
}
