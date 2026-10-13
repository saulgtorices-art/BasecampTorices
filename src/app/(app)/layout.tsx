import { miembroActual } from "@/lib/sesion";
import Shell from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const yo = await miembroActual();
  return <Shell yo={yo}>{children}</Shell>;
}
