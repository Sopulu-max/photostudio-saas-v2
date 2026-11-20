/**
 * A client-facing surface.
 *
 * `data-surface="client"` restates the light palette for this subtree, so a
 * visitor whose laptop is in dark mode does not repaint a studio's shopfront.
 * What a client sees is the studio's presentation of its own work — the
 * gallery even carries a theme they chose — and that is not the viewer's to
 * override.
 */
export default function ClientSurfaceLayout({ children }: { children: React.ReactNode }) {
  return <div data-surface="client">{children}</div>;
}
