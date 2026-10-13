export default function Encabezado({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">{titulo}</h1>
          {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
