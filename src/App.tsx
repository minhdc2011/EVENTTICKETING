import {useEffect} from 'react';
import {
  ArtistLineup,
  FooterAndModals,
  HeroSection,
  PricingSection,
  SeatingSection,
} from './components/ConcertSections';
import {SiteChrome} from './components/SiteChrome';

const BODY_CLASS =
  'min-h-screen bg-[#070707] text-slate-100 antialiased selection:bg-lime-300 selection:text-black relative';

export default function App() {
  useEffect(() => {
    document.body.className = BODY_CLASS;
    void import('./legacy/concertRuntime.js').catch((error) => {
      console.error('Không thể khởi tạo trải nghiệm concert:', error);
    });
  }, []);

  return (
    <>
      <SiteChrome />
      <main>
        <HeroSection />
        <ArtistLineup />
        <PricingSection />
        <SeatingSection />
      </main>
      <FooterAndModals />
    </>
  );
}
