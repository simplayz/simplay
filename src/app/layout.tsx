import type { Metadata } from 'next';
import '../index.css';
export const metadata: Metadata = {
  title: 'Simplayz — World Simulation & City Operations Console',
  description: 'A world simulation on OpenStreetMap. Neighboring CEOs are simulated; shared multiplayer is not yet implemented.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head><body><div id="root">{children}</div></body></html>;
}
