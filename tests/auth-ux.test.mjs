import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createAuthAttemptGuard} from '../src/domain/accountAccess.js';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

test('Criterion 1: BuyerAuth implements full ARIA tab keyboard navigation and roving tabindex', async () => {
  const buyerSrc = await read('../src/components/BuyerAuth.tsx');
  const authCss = await read('../src/components/site/auth.css');

  // Must maintain ARIA tab pattern with role="tablist", two role="tab", and role="tabpanel"
  assert.match(buyerSrc, /role="tablist"/);
  assert.equal((buyerSrc.match(/role="tab"/g) ?? []).length, 2);
  assert.match(buyerSrc, /role="tabpanel"/);
  assert.match(buyerSrc, /aria-selected=\{mode === 'login'\}/);
  assert.match(buyerSrc, /aria-selected=\{mode === 'register'\}/);

  // Roving tabIndex: 0 on active tab, -1 on inactive tab
  assert.match(buyerSrc, /tabIndex=\{mode === 'login' \? 0 : -1\}/);
  assert.match(buyerSrc, /tabIndex=\{mode === 'register' \? 0 : -1\}/);

  // Focus management via refs
  assert.match(buyerSrc, /loginTabRef = useRef<HTMLButtonElement>/);
  assert.match(buyerSrc, /registerTabRef = useRef<HTMLButtonElement>/);
  assert.match(buyerSrc, /ref=\{loginTabRef\}/);
  assert.match(buyerSrc, /ref=\{registerTabRef\}/);

  // Keyboard navigation on tablist: ArrowLeft, ArrowRight, Home, End
  assert.match(buyerSrc, /onKeyDown=\{handleTabKeyDown\}/);
  assert.match(buyerSrc, /'ArrowRight'/);
  assert.match(buyerSrc, /'ArrowLeft'/);
  assert.match(buyerSrc, /'Home'/);
  assert.match(buyerSrc, /'End'/);
  assert.match(buyerSrc, /e\.preventDefault\(\)/);
  assert.match(buyerSrc, /\.focus\(\)/);

  // Disabled styling in auth.css
  assert.match(authCss, /\.et-auth__tabs button:disabled/);
  assert.match(authCss, /\.et-auth__switch button:disabled/);
  assert.match(authCss, /cursor:\s*not-allowed/);
  assert.match(authCss, /opacity:\s*0\.6/);
  assert.match(authCss, /\.et-auth__tabs button:hover:not\(:disabled\)/);
});

test('Criterion 2: Organizer signup retains email confirmation notice without unmounting or onChanged', async () => {
  const authViewSrc = await read('../src/components/organizer-ui/OrganizerAuthView.tsx');
  const portalSrc = await read('../src/components/OrganizerPortal.tsx');

  // In OrganizerAuthView, signup path must NOT call onChanged() or onLoginSuccess()
  const submitFnMatch = authViewSrc.match(/async function submit[\s\S]*?\n  \}/);
  assert.ok(submitFnMatch, 'submit function must exist in OrganizerAuthView');
  const submitBody = submitFnMatch[0];

  assert.ok(!submitBody.includes('await onChanged();\n        if (result'), 'Must not call onChanged before checking result');
  // Confirm onChanged is only called in login mode, never in signup mode
  const loginBranch = submitBody.match(/if \((?:targetMode|currentMode|mode) === 'login'\) \{([\s\S]*?)\} else \{([\s\S]*?)\}/);
  assert.ok(loginBranch, 'Must separate login and signup branches in submit');
  const [_, loginCode, signupCode] = loginBranch;
  assert.ok(loginCode.includes('await onChanged()'), 'Login branch calls onChanged');
  assert.ok(!signupCode.includes('onChanged()'), 'Signup branch must NOT call onChanged()');
  assert.ok(!signupCode.includes('onLoginSuccess()'), 'Signup branch must NOT call onLoginSuccess()');

  // Confirmation email message is set when !result.hasSession
  assert.match(signupCode, /!result\.hasSession/);
  assert.match(signupCode, /Tài khoản đã được tạo thành công! Vui lòng kiểm tra email để xác thực tài khoản trước khi đăng nhập\./);
  assert.match(signupCode, /setMode\('login'\)/);

  // In OrganizerPortal, refreshSession is non-destructive and does not set loading to true
  const refreshMatch = portalSrc.match(/const refreshSession = useCallback\(async \(\) => \{([\s\S]*?)\}, \[\]\);/);
  assert.ok(refreshMatch, 'refreshSession must be defined in OrganizerPortal');
  assert.ok(!refreshMatch[1].includes('setLoading(true)'), 'refreshSession must never set loading back to true');
});

test('Criterion 3: New account with USER session never implies BTC access or triggers onLoginSuccess', async () => {
  const authViewSrc = await read('../src/components/organizer-ui/OrganizerAuthView.tsx');

  // Must not claim "Đăng ký và đăng nhập thành công!"
  assert.ok(
    !authViewSrc.includes('Đăng ký và đăng nhập thành công!'),
    'OrganizerAuthView must not claim successful login for new signup accounts',
  );

  // Must explicitly explain USER role boundary and requirement for Admin activation
  const expectedNotice =
    'Tài khoản đã được tạo với vai trò Khán giả (USER). Quyền Ban tổ chức cần được Quản trị viên kích hoạt trước khi đăng nhập Studio.';
  assert.ok(
    authViewSrc.includes(expectedNotice),
    'OrganizerAuthView must guide new USER accounts on needing admin activation',
  );

  // Mode should reset to login after successful creation
  assert.match(authViewSrc, /setMode\('login'\)/);
});

test('Criterion 4: Concurrency guards prevent duplicate submissions and mode-switch race conditions', async () => {
  const buyerSrc = await read('../src/components/BuyerAuth.tsx');
  const authViewSrc = await read('../src/components/organizer-ui/OrganizerAuthView.tsx');

  // BuyerAuth: synchronous submittingRef lock & attemptGuard
  assert.match(buyerSrc, /submittingRef = useRef\(false\)/);
  assert.match(buyerSrc, /if \(busy \|\| submittingRef\.current\) return;/);
  assert.match(buyerSrc, /attemptGuard\.current\.invalidate\(\)/);
  assert.match(buyerSrc, /disabled=\{busy\}/);

  // Page-prop effect must not override mode while submitting
  assert.match(buyerSrc, /if \(submittingRef\.current\) return;/);

  // OrganizerAuthView: synchronous submittingRef lock & attemptGuard
  assert.match(authViewSrc, /createAuthAttemptGuard/);
  assert.match(authViewSrc, /submittingRef = useRef\(false\)/);
  assert.match(authViewSrc, /if \(busy \|\| submittingRef\.current\) return;/);

  // switchMode helper in OrganizerAuthView guards and invalidates
  assert.match(authViewSrc, /function switchMode\(next: 'login' \| 'signup'\)/);
  assert.match(authViewSrc, /attemptGuard\.current\.invalidate\(\)/);

  // Tab buttons and submit button disabled while busy
  assert.match(authViewSrc, /aria-pressed=\{mode === 'login'\}\s+disabled=\{busy\}/);
  assert.match(authViewSrc, /aria-pressed=\{mode === 'signup'\}\s+disabled=\{busy\}/);
  assert.match(authViewSrc, /type="submit"[^>]*disabled=\{busy\}/);

  // Unit behavior test of createAuthAttemptGuard
  const guard = createAuthAttemptGuard();
  const attempt1 = guard.begin();
  assert.equal(attempt1(), true);

  // New attempt invalidates old
  const attempt2 = guard.begin();
  assert.equal(attempt1(), false);
  assert.equal(attempt2(), true);

  // Mode switch / unmount invalidation
  guard.invalidate();
  assert.equal(attempt2(), false);
});

test('Criterion 5: Alert vs status roles and assertive vs polite aria-live across buyer and organizer flows', async () => {
  const buyerSrc = await read('../src/components/BuyerAuth.tsx');
  const authViewSrc = await read('../src/components/organizer-ui/OrganizerAuthView.tsx');
  const portalSrc = await read('../src/components/OrganizerPortal.tsx');

  // BuyerAuth message box
  assert.match(buyerSrc, /role=\{message\.type === 'error' \? 'alert' : 'status'\}/);
  assert.match(buyerSrc, /aria-live=\{message\.type === 'error' \? 'assertive' : 'polite'\}/);

  // OrganizerAuthView message box
  assert.match(authViewSrc, /role=\{isSuccess \? 'status' : 'alert'\}/);
  assert.match(authViewSrc, /aria-live=\{isSuccess \? 'polite' : 'assertive'\}/);

  // OrganizerDashboard in OrganizerPortal tracks messageType ('error' | 'status')
  assert.match(portalSrc, /const \[messageType, setMessageType\] = useState<'error' \| 'status'>\('status'\)/);
  assert.match(portalSrc, /role=\{messageType === 'error' \? 'alert' : 'status'\}/);
  assert.match(portalSrc, /aria-live=\{messageType === 'error' \? 'assertive' : 'polite'\}/);
  assert.match(portalSrc, /messageType === 'error' \? 'org-alert-danger' : 'org-alert-info'/);
});

test('Invariant preservation: portal access checks and absence of forbidden strings or emojis', async () => {
  const authViewSrc = await read('../src/components/organizer-ui/OrganizerAuthView.tsx');
  const portalSrc = await read('../src/components/OrganizerPortal.tsx');

  // OrganizerAuthView must gate Studio access behind canAccessPortal
  const authPortalIdx = authViewSrc.indexOf("canAccessPortal(session.accountKind, 'ORGANIZER')");
  const validSessionIdx = authViewSrc.indexOf('PHIÊN LÀM VIỆC HỢP LỆ');
  const openStudioIdx = authViewSrc.indexOf('Mở Studio làm việc');

  assert.ok(authPortalIdx !== -1, 'canAccessPortal check must exist in OrganizerAuthView');
  assert.ok(validSessionIdx !== -1, 'PHIÊN LÀM VIỆC HỢP LỆ must exist');
  assert.ok(openStudioIdx !== -1, 'Mở Studio làm việc must exist');
  assert.ok(authPortalIdx < validSessionIdx, 'canAccessPortal must precede valid session badge');
  assert.ok(authPortalIdx < openStudioIdx, 'canAccessPortal must precede open studio button');

  // OrganizerPortal order invariant
  const allowedIdx = portalSrc.indexOf('const allowed =');
  const accessDeniedIdx = portalSrc.indexOf('<OrganizerAccessDeniedView');
  const loginPageIdx = portalSrc.indexOf("page === 'login'");

  assert.ok(allowedIdx !== -1 && accessDeniedIdx !== -1 && loginPageIdx !== -1);
  assert.ok(
    allowedIdx < accessDeniedIdx && accessDeniedIdx < loginPageIdx,
    'OrganizerPortal must maintain allowed < accessDenied < loginPage order',
  );

  // No forbidden emojis in organizer UI
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.equal(authViewSrc.match(emojiRegex), null, 'OrganizerAuthView must contain no emojis');
  assert.equal(portalSrc.match(emojiRegex), null, 'OrganizerPortal must contain no emojis');
});
