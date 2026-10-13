import clsx from "clsx";
import { colorGrupo, iniciales } from "@/lib/ui";

export default function Avatar({
  nombre,
  tam = 24,
  className,
}: {
  nombre: string | null | undefined;
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
