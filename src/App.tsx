import {useCallback, useEffect, useState} from 'react';
import {EventCatalog} from './components/EventCatalog';
import {GenericEventPage} from './components/GenericEventPage';
import './components/event-template/event-template.css';
import {OrganizerPortal} from './components/OrganizerPortal';
import {BuyerAuth} from './components/BuyerAuth';
import {NotFoundPage} from './components/site/NotFoundPage';
import {
  AppErrorState,
  AppLoadingState,
  EventNotFoundState,
} from './components/SprintOneStates';
import {
  loadPublicEvent,
  PublicEventNotFoundError,
  type PublicEventRecord,
} from './services/eventService';
import {runtimeConfig, setActiveEventContext} from './config/runtime';
import {resolvePublicRoute} from './domain/publicRoute';

const BODY_CLASS =
  // impeccable-disable-next-line gray-on-color -- lime-300 is only the selection highlight, whose text is black
  'min-h-screen bg-[#070707] text-slate-100 antialiased selection:bg-lime-300 selection:text-black relative';

export default function App() {
  const readRoute = useCallback(() => resolvePublicRoute(
    window.location.pathname,
    runtimeConfig.eventId.toLowerCase().replaceAll('_', '-'),
    window.location.hash,
    window.location.search,
    import.meta.env.BASE_URL,
  ), []);
  const [route, setRoute] = useState(readRoute);
  const [event, setEvent] = useState<PublicEventRecord | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not-found'>('loading');

  useEffect(() => {
    // In-page anchors (#tickets, #seating-section…) fire hashchange too. Keep the same
    // route object when nothing meaningful changed, otherwise the event reloads and the
    // anchor target unmounts before the browser can scroll to it.
    const handleRouteChange = () =>
      setRoute((prev) => {
        const next = readRoute();
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
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
        // Drafts are only loaded through the explicit preview=1 branch above.
        nextEvent = await loadPublicEvent(route.eventSlug, route.showSlug);
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

  if (route.kind === 'notfound') return <NotFoundPage />;
  if (route.kind === 'catalog') return <EventCatalog />;
  if (route.kind === 'organizer') return <OrganizerPortal page={route.page} />;
  if (route.kind === 'account') return <BuyerAuth page={route.page} />;

  if (loadState === 'loading') return <AppLoadingState />;
  if (loadState === 'not-found') return <EventNotFoundState />;
  if (loadState === 'error' || !event) return <AppErrorState onRetry={loadEvent} />;

  return <GenericEventPage event={event} />;
}
