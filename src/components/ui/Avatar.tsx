import clsx from "clsx";
import { colorGrupo, iniciales } from "@/lib/ui";

export default function Avatar({
  nombre,
  foto,
  tam = 24,
  className,
}: {
  nombre: string | null | undefined;
  /** URL de la foto de perfil; si no hay, se muestran las iniciales. */
  foto?: string | null;
  tam?: number;
  className?: string;
}) {
  if (!nombre)
    return (
      <span
        style={{ width: tam, height: tam }}
        className={clsx("inline-block shrink-0 rounded-full border border-dashed border-slate-300", className)}
      />
    );
  if (foto)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={foto}
        alt={nombre}
        title={nombre}
        width={tam}
        height={tam}
        style={{ width: tam, height: tam }}
        className={clsx("inline-block shrink-0 rounded-full bg-slate-100 object-cover", className)}
      />
    );
  return (
    <span
      title={nombre}
      style={{ width: tam, height: tam, backgroundColor: colorGrupo(nombre), fontSize: tam * 0.42 }}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        className,
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}
