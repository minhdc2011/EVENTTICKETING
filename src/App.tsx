import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ArtistLineup,
  FooterAndModals,
  HeroSection,
  PricingSection,
  SeatingSection,
} from './components/ConcertSections';
import {SiteChrome} from './components/SiteChrome';
import {
  AppErrorState,
  AppLoadingState,
  EventNotFoundState,
  SaleStatusBanner,
} from './components/SprintOneStates';
import {deriveSaleStatus} from './domain/eventStatus';
import {
  loadPublicEvent,
  PublicEventNotFoundError,
  type PublicEventRecord,
} from './services/eventService';

const BODY_CLASS =
  'min-h-screen bg-[#070707] text-slate-100 antialiased selection:bg-lime-300 selection:text-black relative';

export default function App() {
  const [event, setEvent] = useState<PublicEventRecord | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not-found'>('loading');
  const [clock, setClock] = useState(() => Date.now());

  const loadEvent = useCallback(async () => {
    setLoadState('loading');
    try {
      const nextEvent = await loadPublicEvent();
      setEvent(nextEvent);
      setLoadState('ready');
    } catch (error) {
      console.error('Không thể tải sự kiện công khai:', error);
      setEvent(null);
      setLoadState(error instanceof PublicEventNotFoundError ? 'not-found' : 'error');
    }
  }, []);

  useEffect(() => {
    document.body.className = BODY_CLASS;
    void loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const saleStatus = useMemo(() => event ? deriveSaleStatus({
    now: new Date(clock),
    saleStartsAt: event.saleStartsAt,
    saleEndsAt: event.saleEndsAt,
    databaseStatus: event.databaseSaleStatus,
    hasAvailability: true,
  }) : 'UPCOMING', [clock, event]);

  useEffect(() => {
    if (loadState !== 'ready' || !event) return;
    document.body.dataset.saleStatus = saleStatus;
    document.body.dataset.saleStartsAt = event.saleStartsAt;
    document.body.dispatchEvent(new CustomEvent('eventticketing:sale-status', {
      detail: {status: saleStatus},
    }));
  }, [event, loadState, saleStatus]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    void import('./legacy/concertRuntime.js').catch((error) => {
      console.error('Không thể khởi tạo trải nghiệm concert:', error);
    });
  }, [loadState]);

  if (loadState === 'loading') return <AppLoadingState />;
  if (loadState === 'not-found') return <EventNotFoundState />;
  if (loadState === 'error' || !event) return <AppErrorState onRetry={loadEvent} />;

  return (
    <>
      <SiteChrome saleStatus={saleStatus} />
      <main>
        <SaleStatusBanner event={event} status={saleStatus} />
        <HeroSection />
        <ArtistLineup />
        <PricingSection />
        <SeatingSection />
      </main>
      <FooterAndModals />
    </>
  );
}
