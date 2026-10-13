import BotonGoogle from "./BotonGoogle";

const MENSAJES: Record<string, string> = {
  "no-autorizado":
    "Tu correo no está registrado en el equipo. Pide a un administrador que te dé de alta.",
  auth: "No se pudo iniciar sesión con Google. Intenta de nuevo.",
  "sin-codigo": "El inicio de sesión se interrumpió. Intenta de nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const mensaje = error ? (MENSAJES[error] ?? "Ocurrió un error.") : null;

  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden p-6">
      {/* Fondo decorativo */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-marca-500/15 blur-3xl" />
        <div className="absolute right-[-10%] bottom-[-20%] h-[360px] w-[360px] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(var(--color-slate-300)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] [background-size:22px_22px] opacity-60" />
      </div>

      <div className="relative w-full max-w-sm animate-subir">
        <div className="rounded-2xl border border-slate-200 bg-superficie/90 p-8 shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-marca-500 to-marca-700 text-xl font-bold tracking-tight text-white shadow-lg shadow-marca-600/30">
              BT
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Basecamp Torices</h1>
            <p className="mt-1 text-sm text-slate-500">Desarrollo Web · Grupo Torices</p>
          </div>
          {mensaje && (
            <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {mensaje}
            </p>
          )}
          <BotonGoogle />
          <p className="mt-5 text-center text-xs text-slate-400">
            Solo pueden entrar los correos registrados en el equipo.
          </p>
        </div>
      </div>
    </main>
  );
}
