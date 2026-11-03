import assert from 'node:assert/strict';
import test from 'node:test';
import {pickFeaturedEvent} from '../src/components/event-template/eventTemplateLogic.js';

test('pickFeaturedEvent returns events[0] when list has elements, even if subsequent events are sooner', () => {
  const farFutureEvent = {
    id: 'evt-2030',
    name: 'Future Festival 2030',
    startsAt: '2030-01-01T20:00:00.000Z',
  };
  const tomorrowEvent = {
    id: 'evt-tomorrow',
    name: 'Tomorrow Acoustic Night',
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const events = [farFutureEvent, tomorrowEvent];
  const featured = pickFeaturedEvent(events);

  // Regression check: must return the first item, not the sooner upcoming event
  assert.equal(featured, farFutureEvent);
  assert.equal(featured?.id, 'evt-2030');
});

test('pickFeaturedEvent returns null for empty array, null, and undefined', () => {
  assert.equal(pickFeaturedEvent([]), null);
  assert.equal(pickFeaturedEvent(null), null);
  assert.equal(pickFeaturedEvent(undefined), null);
});
