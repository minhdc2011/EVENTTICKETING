import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {SUPER_CONCERT_ARTISTS} from '../src/domain/artistLineup.js';
import {
  catalogArtistKey,
  collectCatalogArtistOptions,
  filterCatalogEvents,
  groupCatalogArtistsByEvent,
  normalizeCatalogArtists,
  toggleCatalogArtist,
} from '../src/domain/catalogFilters.js';

test('normalizes NGHE_SI as object, 1-element array, null with flat fields', () => {
  const rows = [
    {SuKienID: 1, NgheSiID: 10, ThuTuHienThi: 1, NGHE_SI: {NgheSiID: 10, NgheDanh: 'An'}},
    {SuKienID: 1, NgheSiID: 11, ThuTuHienThi: 2, NGHE_SI: [{NgheSiID: 11, HoTen: 'Binh'}]},
    {SuKienID: 1, NgheSiID: 12, ThuTuHienThi: 3, NGHE_SI: null, NgheDanh: 'Chi'},
  ];
  const result = normalizeCatalogArtists(rows, 'db');
  assert.deepEqual(result, [
    {key: 'db:10', id: 10, name: 'An'},
    {key: 'db:11', id: 11, name: 'Binh'},
    {key: 'db:12', id: 12, name: 'Chi'},
  ]);
});

test('accepts null, non-array, single object; drops null rows and collapses duplicates', () => {
  assert.deepEqual(normalizeCatalogArtists(null, 'db'), []);
  assert.deepEqual(normalizeCatalogArtists('x', 'db'), []);
  assert.equal(normalizeCatalogArtists({NgheSiID: 5, NgheDanh: 'Solo'}, 'api').length, 1);
  const rows = [
    null,
    {NgheSiID: 7, NgheDanh: 'Dup'},
    {NgheSiID: 7, NgheDanh: 'Dup'},
    {NGHE_SI: null},
  ];
  assert.deepEqual(normalizeCatalogArtists(rows, 'db'), [{key: 'db:7', id: 7, name: 'Dup'}]);
});

test('same name with different ids stays separate; same id across sources differs', () => {
  const result = normalizeCatalogArtists(
    [
      {NgheSiID: 1, NgheDanh: 'Minh'},
      {NgheSiID: 2, NgheDanh: 'Minh'},
    ],
    'db',
  );
  assert.equal(result.length, 2);
  assert.notEqual(result[0].key, result[1].key);
  assert.notEqual(catalogArtistKey('db', 1, 'A'), catalogArtistKey('mock', 1, 'A'));
  assert.equal(catalogArtistKey('mock', 0, '  Lan '), 'mock:name:lan');
});

test('groups link rows by SuKienID', () => {
  const grouped = groupCatalogArtistsByEvent([
    {SuKienID: 1, NgheSiID: 10, NGHE_SI: {NgheDanh: 'A'}},
    {SuKienID: 2, NgheSiID: 11, NGHE_SI: [{NgheDanh: 'B'}]},
    {SuKienID: 1, NgheSiID: 12, NGHE_SI: {NgheDanh: 'C'}},
  ]);
  assert.deepEqual(grouped.get(1).map((a) => a.name), ['A', 'C']);
  assert.deepEqual(grouped.get(2).map((a) => a.key), ['db:11']);
  assert.equal(grouped.get(3), undefined);
  assert.equal(groupCatalogArtistsByEvent(null).size, 0);
});

test('toggle selects then unselects without mutating', () => {
  const start = ['db:1'];
  const added = toggleCatalogArtist(start, 'db:2');
  assert.deepEqual(added, ['db:1', 'db:2']);
  assert.deepEqual(start, ['db:1']);
  assert.deepEqual(toggleCatalogArtist(added, 'db:1'), ['db:2']);
});

const artistA = {key: 'db:1', id: 1, name: 'Ánh'};
const artistB = {key: 'db:2', id: 2, name: 'Bảo'};
const events = [
  {name: 'Rock Night', venueName: 'Hall X', category: 'AM_NHAC', artists: [artistA]},
  {name: 'Jazz Evening', venueName: 'Hall Y', category: 'AM_NHAC', artists: [artistA, artistB]},
  {name: 'Tech Talk', venueName: 'Hall X', category: 'WORKSHOP', artists: [artistB]},
  {name: 'Silent Show', venueName: 'Hall Z', category: 'AM_NHAC'},
];
const names = (list) => list.map((e) => e.name);

test('collectCatalogArtistOptions is unique by key and sorted', () => {
  const options = collectCatalogArtistOptions(events);
  assert.deepEqual(options.map((a) => a.key), ['db:1', 'db:2']);
});

test('filter: no artist filter shows events without artists; artist filter excludes them', () => {
  assert.equal(filterCatalogEvents(events, {}).length, 4);
  assert.ok(names(filterCatalogEvents(events, {})).includes('Silent Show'));
  assert.ok(!names(filterCatalogEvents(events, {artistKeys: ['db:1']})).includes('Silent Show'));
});

test('filter: artist matches ANY selected key; unselecting restores', () => {
  let keys = toggleCatalogArtist([], 'db:1');
  assert.deepEqual(names(filterCatalogEvents(events, {artistKeys: keys})), ['Rock Night', 'Jazz Evening']);
  keys = toggleCatalogArtist(keys, 'db:2');
  assert.equal(filterCatalogEvents(events, {artistKeys: keys}).length, 3);
  keys = toggleCatalogArtist(toggleCatalogArtist(keys, 'db:1'), 'db:2');
  assert.equal(filterCatalogEvents(events, {artistKeys: keys}).length, 4);
});

test('filter: artist AND category AND query', () => {
  const result = filterCatalogEvents(events, {artistKeys: ['db:2'], category: 'AM_NHAC', query: 'hall y'});
  assert.deepEqual(names(result), ['Jazz Evening']);
  assert.deepEqual(names(filterCatalogEvents(events, {artistKeys: ['db:2'], category: 'AM_NHAC'})), ['Jazz Evening']);
});

test('filter: query matches artist name; no-result case', () => {
  assert.deepEqual(names(filterCatalogEvents(events, {query: 'bảo'})), ['Jazz Evening', 'Tech Talk']);
  assert.deepEqual(filterCatalogEvents(events, {artistKeys: ['db:1'], category: 'WORKSHOP'}), []);
  assert.deepEqual(filterCatalogEvents(events, {query: 'zzz-none'}), []);
});

test('mock isolation: Super Concert seed only affects the event it is given', () => {
  const superArtists = normalizeCatalogArtists(SUPER_CONCERT_ARTISTS, 'mock');
  assert.equal(superArtists.length, 6);
  assert.ok(superArtists.every((a) => a.key.startsWith('mock:')));
  const catalog = [
    {name: 'Super Concert', category: 'AM_NHAC', artists: superArtists},
    {name: 'Other', category: 'AM_NHAC', artists: normalizeCatalogArtists([], 'mock')},
    {name: 'Real', category: 'AM_NHAC', artists: normalizeCatalogArtists([{NgheSiID: 1, NgheDanh: 'Sơn Tùng M-TP'}], 'db')},
  ];
  const result = filterCatalogEvents(catalog, {artistKeys: [superArtists[0].key]});
  assert.deepEqual(names(result), ['Super Concert']);
});

test('eventService loadPublicEvents batches artists and never calls loadPublicArtists', async () => {
  const source = await readFile(new URL('../src/services/eventService.ts', import.meta.url), 'utf8');
  const start = source.indexOf('function loadPublicEvents');
  assert.ok(start >= 0, 'loadPublicEvents exists');
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:export )?(?:async )?function /);
  const body = next >= 0 ? source.slice(start, start + 1 + next) : source.slice(start);
  assert.ok(!body.includes('loadPublicArtists'), 'must not call loadPublicArtists per card');
  assert.ok(body.includes("'SU_KIEN_NGHE_SI'"), 'queries SU_KIEN_NGHE_SI');
  assert.ok(body.includes('.in('), 'uses a batch .in() query');
});
