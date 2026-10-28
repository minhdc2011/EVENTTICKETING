import type * as React from 'react';
import {EventHeader} from './event-template/EventHeader';
import type {PublicEventRecord} from '../services/eventService';

export function SiteChrome({
  event,
  saleStatus,
}: {
  event?: PublicEventRecord;
  saleStatus: string;
}) {
  return (
    <>
      <div id="stA" aria-hidden="true" />
      <div id="stB" aria-hidden="true" />
      {event && <EventHeader event={event} saleOpen={saleStatus === 'ON_SALE'} />}
    </>
  );
}
