import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

test('buyer auth page uses the shared global header and the auth stylesheet', async () => {
  const src = await read('../src/components/BuyerAuth.tsx');
  assert.match(src, /<GlobalHeader\s/);
  assert.match(src, /import '\.\/site\/auth\.css'/);
  assert.doesNotMatch(src, /marketplace-shell|marketplace-nav|buyer-auth-split-layout/);
});

test('login/register tabs are real tabs wired to one panel', async () => {
  const src = await read('../src/components/BuyerAuth.tsx');
  assert.match(src, /role="tablist"/);
  assert.equal((src.match(/role="tab"/g) ?? []).length, 2);
  assert.match(src, /role="tabpanel"/);
  assert.match(src, /aria-selected=\{mode === 'login'\}/);
  assert.match(src, /aria-selected=\{mode === 'register'\}/);
});

test('both password fields have an accessible show/hide toggle that reports its state', async () => {
  const src = await read('../src/components/BuyerAuth.tsx');
  assert.match(src, /aria-pressed=\{showPassword\}/);
  assert.match(src, /aria-pressed=\{showConfirmPassword\}/);
  assert.match(src, /'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'/);
});

test('account view shows email, name, account type and keeps sign out and the organizer link', async () => {
  const src = await read('../src/components/BuyerAuth.tsx');
  assert.match(src, /session\.email/);
  assert.match(src, /session\.fullName/);
  assert.match(src, /ACCOUNT_KIND_LABELS/);
  assert.match(src, /onClick=\{handleSignOut\}/);
  assert.match(src, /Mở Studio BTC/);
});

test('the email-confirmation notice is kept after sign-up', async () => {
  const src = await read('../src/components/BuyerAuth.tsx');
  assert.match(src, /requiresEmailConfirmation/);
  assert.match(src, /kiểm tra hộp thư email để kích hoạt tài khoản trước khi đăng nhập/);
});

test('auth card styles use the shared tokens and 44px targets', async () => {
  const css = await read('../src/components/site/auth.css');
  assert.match(css, /var\(--et-blue\)/);
  assert.match(css, /min-height:\s*var\(--et-tap-min\)/);
  assert.match(css, /\.et-auth__toggle\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
});
