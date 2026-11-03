import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {isSuperConcertEvent, resolveTemplateKey, SUPER_CONCERT_KEY} from '../src/domain/superConcert.js';
import * as artistLineup from '../src/domain/artistLineup.js';
import * as publicSchedule from '../src/domain/publicSchedule.js';

test('Super Concert is identified by stable keys, never by a bare numeric id', () => {
  assert.equal(isSuperConcertEvent({templateKey: SUPER_CONCERT_KEY}), true);
  assert.equal(isSuperConcertEvent({code: SUPER_CONCERT_KEY}), true);
  assert.equal(isSuperConcertEvent({slug: 'super-concert-2026'}), true);
  assert.equal(isSuperConcertEvent({id: 1}), false);
  assert.equal(isSuperConcertEvent({id: 1, templateKey: 'DEFAULT'}), false);
  assert.equal(isSuperConcertEvent(null), false);
});

test('lineup and schedule helpers share the single definition', () => {
  assert.equal(artistLineup.isSuperConcertEvent, isSuperConcertEvent);
  assert.equal(publicSchedule.isSuperConcertEvent, isSuperConcertEvent);
});

test('template key of a raw SU_KIEN row comes from TemplateKey or the concert slug, not SuKienID', () => {
  assert.equal(resolveTemplateKey({TemplateKey: SUPER_CONCERT_KEY, SuKienID: 9}), SUPER_CONCERT_KEY);
  assert.equal(resolveTemplateKey({Slug: 'super-concert-2026', SuKienID: 9}), SUPER_CONCERT_KEY);
  assert.equal(resolveTemplateKey({Slug: 'SUPER_CONCERT_2026'}), SUPER_CONCERT_KEY);
  assert.equal(resolveTemplateKey({SuKienID: 1, Slug: 'creative-tech-summit-2026'}), 'DEFAULT');
  assert.equal(resolveTemplateKey({SuKienID: 1}), 'DEFAULT');
  assert.equal(resolveTemplateKey(null), 'DEFAULT');
});

test('eventService maps the template key without the numeric id shortcut', async () => {
  const src = await readFile(new URL('../src/services/eventService.ts', import.meta.url), 'utf8');
  assert.match(src, /templateKey: resolveTemplateKey\(row\)/);
  assert.doesNotMatch(src, /Number\(row\.SuKienID\)\s*===\s*1/);
});
