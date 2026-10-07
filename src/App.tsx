import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ArtistLineup,
  FooterAndModals,
  HeroSection,
  PricingSection,
  SeatingSection,
} from './components/ConcertSections';
import {SiteChrome} from './components/SiteChrome';
import {EventCatalog, ShowSwitcher} from './components/EventCatalog';
import {GenericEventPage} from './components/GenericEventPage';
import {OrganizerPortal} from './components/OrganizerPortal';
import {BuyerAuth} from './components/BuyerAuth';
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
import {runtimeConfig, setActiveEventContext} from './config/runtime';
import {resolvePublicRoute} from './domain/publicRoute';

const BODY_CLASS =
  'min-h-screen bg-[#070707] text-slate-100 antialiased selection:bg-lime-300 selection:text-black relative';

export default function App() {
  const readRoute = useCallback(() => resolvePublicRoute(
    window.location.pathname,
    runtimeConfig.eventId.toLowerCase().replaceAll('_', '-'),
    window.location.hash,
    window.location.search,
  ), []);
  const [route, setRoute] = useState(readRoute);
  const [event, setEvent] = useState<PublicEventRecord | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not-found'>('loading');
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const handleRouteChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, [readRoute]);

  const loadEvent = useCallback(async () => {
    setLoadState('loading');
    try {
      if (route.kind !== 'detail') return;
      const searchParams = new URLSearchParams(window.location.search);
      const queryRoute = searchParams.get('route') || '';
      const isPreview =
        searchParams.get('preview') === '1' ||
        queryRoute.includes('preview=1') ||
        window.location.hash.includes('preview=1');

      let nextEvent: PublicEventRecord;
      if (isPreview) {
        const {loadEventForPreview} = await import('./services/organizerService');
        nextEvent = await loadEventForPreview(route.eventSlug, route.showSlug);
      } else {
        try {
          nextEvent = await loadPublicEvent(route.eventSlug, route.showSlug);
        } catch (err) {
          if (err instanceof PublicEventNotFoundError) {
            try {
              const {loadEventForPreview} = await import('./services/organizerService');
              nextEvent = await loadEventForPreview(route.eventSlug, route.showSlug);
            } catch {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }

      setActiveEventContext({
        eventId: nextEvent.slug,
        eventDatabaseId: nextEvent.id,
        showId: nextEvent.selectedShow.id,
        showSlug: nextEvent.selectedShow.slug,
      });
      setEvent(nextEvent);
      setLoadState('ready');
    } catch (error) {
      console.error('Không thể tải sự kiện:', error);
      setEvent(null);
      setLoadState(error instanceof PublicEventNotFoundError ? 'not-found' : 'error');
    }
  }, [route]);

  useEffect(() => {
    document.body.className = BODY_CLASS;
    if (route.kind !== 'detail') {
      setLoadState('ready');
      return;
    }
    void loadEvent();
  }, [loadEvent, route.kind]);

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
    document.title = `${event.name} | EventTicketing`;
    document.body.dataset.saleStatus = saleStatus;
    document.body.dataset.saleStartsAt = event.saleStartsAt;
    document.body.dispatchEvent(new CustomEvent('eventticketing:sale-status', {
      detail: {status: saleStatus},
    }));
  }, [event, loadState, saleStatus]);

  useEffect(() => {
    if (loadState !== 'ready' || route.kind !== 'detail' || event?.templateKey !== 'SUPER_CONCERT_2026') return;
    void import('./legacy/concertRuntime.js').catch((error) => {
      console.error('Không thể khởi tạo trải nghiệm concert:', error);
    });
  }, [event?.templateKey, loadState, route.kind]);

  if (route.kind === 'catalog') return <EventCatalog />;
  if (route.kind === 'organizer') return <OrganizerPortal page={route.page} />;
  if (route.kind === 'account') return <BuyerAuth page={route.page} />;

  if (loadState === 'loading') return <AppLoadingState />;
  if (loadState === 'not-found') return <EventNotFoundState />;
  if (loadState === 'error' || !event) return <AppErrorState onRetry={loadEvent} />;

  if (event.templateKey !== 'SUPER_CONCERT_2026') return <GenericEventPage event={event} />;

  return (
    <>
      <SiteChrome saleStatus={saleStatus} />
      <main>
        <SaleStatusBanner event={event} status={saleStatus} />
        <ShowSwitcher event={event} />
        <HeroSection />
        <ArtistLineup />
        <PricingSection />
        <SeatingSection />
      </main>
      <FooterAndModals />
    </>
  );
}
