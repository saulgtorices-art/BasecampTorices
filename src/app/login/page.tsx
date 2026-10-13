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
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-marca-600 text-lg font-bold text-white">
            BT
          </div>
          <div>
            <h1 className="text-lg font-semibold">Basecamp Torices</h1>
            <p className="text-sm text-slate-500">Desarrollo Web · Grupo Torices</p>
          </div>
        </div>
        {mensaje && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{mensaje}</p>
        )}
        <BotonGoogle />
        <p className="mt-4 text-center text-xs text-slate-400">
          Solo pueden entrar los correos registrados en el equipo.
        </p>
      </div>
    </main>
  );
}
