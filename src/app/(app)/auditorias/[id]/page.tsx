import Reporte from "@/components/auditoria/Reporte";

export default async function AuditoriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Reporte id={id} />;
}
