import TopBar from '@/components/navigation/TopBar';
import { VisualEngineOverlay } from '@/components/visual-engine/VisualEngineOverlay';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar />
      <main style={{ flex: 1, padding: '32px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {children}
        </div>
      </main>
      <VisualEngineOverlay />
    </div>
  );
}
