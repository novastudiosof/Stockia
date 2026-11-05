// A diferencia del layout, un template se vuelve a montar en cada navegación:
// por eso la animación de entrada se repite al cambiar de pantalla.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
