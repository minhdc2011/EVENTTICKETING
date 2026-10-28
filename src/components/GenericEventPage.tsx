import {useCallback, useEffect, useMemo, useState} from 'react';
import {loadPublicTicketTiers, type PublicEventRecord, type PublicTicketTier} from '../services/eventService';
import {ArtistLineup, ConcertRuntimeOverlays, SeatingSection} from './ConcertSections';
import {EventTemplate, type EventTemplateSlots} from './event-template';

/**
 * Caller-level specialization adapter: supplies additive rich slots for Super Concert
 * while generic and organizer-created events receive empty slots.
 */
export function resolveEventTemplateSlots(event: PublicEventRecord): EventTemplateSlots {
  if (event.templateKey !== 'SUPER_CONCERT_2026') {
    return {};
  }

  return {
    ambient: (
      <>
        <div id="stA" aria-hidden="true" />
        <div id="stB" aria-hidden="true" />
      </>
    ),
    lineup: <ArtistLineup event={event} />,
    seating: <SeatingSection event={event} />,
    overlays: <ConcertRuntimeOverlays />,
  };
}

export function GenericEventPage({event}: {event: PublicEventRecord}) {
  const [tiers, setTiers] = useState<PublicTicketTier[]>([]);
  const [tierState, setTierState] = useState<'loading' | 'ready' | 'error'>('loading');

  const fetchTiers = useCallback(() => {
    setTierState('loading');
    loadPublicTicketTiers(event)
      .then((rows) => {
        setTiers(rows);
        setTierState('ready');
      })
      .catch((error) => {
        console.error('Không thể tải danh sách hạng vé sự kiện:', error);
        setTierState('error');
      });
  }, [event]);

  useEffect(() => {
    document.title = `${event.name} | EventTicketing`;
    fetchTiers();
  }, [event, fetchTiers]);

  const slots = useMemo(() => resolveEventTemplateSlots(event), [event]);

  return (
    <EventTemplate
      event={event}
      tiers={tiers}
      tierState={tierState}
      onRetryTiers={fetchTiers}
      slots={slots}
    />
  );
}

export {GenericEventPage as EventDetailPage};
