import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INITIAL_VIEW, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP,
  centerOnContentPoint, clampView, clampZoom, exceedsDragThreshold,
  keyToAction, panBy, pinchView, wheelZoomFactor, zoomAtPoint, zoomByFactor,
} from '../src/domain/panZoom.js';

const sizes = {vw: 800, vh: 500, cw: 800, ch: 500};
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

test('zoom is clamped between the minimum and maximum level', () => {
  assert.equal(clampZoom(100), MAX_ZOOM);
  assert.equal(clampZoom(0.01), MIN_ZOOM);
  assert.equal(clampZoom(2), 2);
  assert.equal(clampZoom(NaN), 1);
});

test('zooming around the pointer keeps the content point under the pointer fixed', () => {
  const point = {x: 600, y: 120};
  const next = zoomAtPoint(INITIAL_VIEW, 2, point, sizes);
  close((point.x - INITIAL_VIEW.x) / INITIAL_VIEW.zoom, (point.x - next.x) / next.zoom);
  close((point.y - INITIAL_VIEW.y) / INITIAL_VIEW.zoom, (point.y - next.y) / next.zoom);
  assert.equal(next.zoom, 2);
});

test('pan is limited so empty space is never exposed beyond the content edges', () => {
  const zoomed = {zoom: 2, x: 0, y: 0};
  const dragFar = panBy(zoomed, 5000, 5000, sizes);
  assert.deepEqual([dragFar.x, dragFar.y], [0, 0]);
  const dragOther = panBy(zoomed, -5000, -5000, sizes);
  assert.deepEqual([dragOther.x, dragOther.y], [800 - 1600, 500 - 1000]);
});

test('content smaller than the frame is centred and cannot be panned', () => {
  const small = clampView({zoom: 0.6, x: 300, y: -200}, sizes);
  close(small.x, (800 - 480) / 2);
  close(small.y, (500 - 300) / 2);
});

test('at zoom 1 content wider than the frame (phones) can still be panned horizontally', () => {
  const wide = {vw: 360, vh: 500, cw: 520, ch: 500};
  const moved = panBy(INITIAL_VIEW, -100, 0, wide);
  assert.equal(moved.x, -100);
  assert.equal(panBy(INITIAL_VIEW, -9999, 0, wide).x, 360 - 520);
});

test('zoom by factor stays inside bounds in both directions', () => {
  let view = INITIAL_VIEW;
  for (let i = 0; i < 20; i += 1) view = zoomByFactor(view, ZOOM_STEP, sizes);
  assert.equal(view.zoom, MAX_ZOOM);
  for (let i = 0; i < 30; i += 1) view = zoomByFactor(view, 1 / ZOOM_STEP, sizes);
  assert.equal(view.zoom, MIN_ZOOM);
});

test('pinch scales by finger distance and the content under the midpoint follows the fingers', () => {
  const start = {distance: 100, mid: {x: 400, y: 250}};
  const current = {distance: 200, mid: {x: 450, y: 260}};
  const view = pinchView(INITIAL_VIEW, start, current, sizes);
  assert.equal(view.zoom, 2);
  const contentX = (start.mid.x - INITIAL_VIEW.x) / INITIAL_VIEW.zoom;
  close(view.x + contentX * view.zoom, current.mid.x);
  assert.equal(pinchView(INITIAL_VIEW, {distance: 0, mid: start.mid}, current, sizes).zoom, 1);
});

test('centering on a content point moves it to the frame centre', () => {
  const view = centerOnContentPoint({zoom: 3, x: 0, y: 0}, {x: 400, y: 250}, sizes);
  close(view.x + 400 * 3, 400);
  close(view.y + 250 * 3, 250);
});

test('a drag only counts beyond the movement threshold, so taps stay clicks', () => {
  assert.equal(exceedsDragThreshold(2, 2), false);
  assert.equal(exceedsDragThreshold(0, 0), false);
  assert.equal(exceedsDragThreshold(10, 0), true);
  assert.equal(exceedsDragThreshold(5, 5), true);
});

test('keyboard mapping: arrows pan, +/- zoom, 0 resets, anything else is ignored', () => {
  assert.equal(keyToAction('ArrowLeft').type, 'pan');
  assert.ok(keyToAction('ArrowLeft').dx > 0 && keyToAction('ArrowRight').dx < 0);
  assert.ok(keyToAction('ArrowUp').dy > 0 && keyToAction('ArrowDown').dy < 0);
  assert.ok(keyToAction('+').factor > 1 && keyToAction('=').factor > 1);
  assert.ok(keyToAction('-').factor < 1);
  assert.deepEqual(keyToAction('0'), {type: 'reset'});
  assert.equal(keyToAction('Enter'), null);
  assert.equal(keyToAction(' '), null);
});

test('wheel zoom: scrolling up zooms in, down zooms out, symmetric', () => {
  assert.ok(wheelZoomFactor(-100) > 1);
  assert.ok(wheelZoomFactor(100) < 1);
  close(wheelZoomFactor(-100) * wheelZoomFactor(100), 1);
});

test('camera maths never produces NaN even for a not-yet-measured (0x0) frame', () => {
  const zero = {vw: 0, vh: 0, cw: 0, ch: 0};
  const v = zoomAtPoint(INITIAL_VIEW, 2, {x: 0, y: 0}, zero);
  assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom));
});
