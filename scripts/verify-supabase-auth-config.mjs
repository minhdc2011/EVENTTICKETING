const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env.local.');
}

const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
  'Content-Type': 'application/json',
};

async function main() {
  const [settingsRes, healthRes] = await Promise.all([
    fetch(`${supabaseUrl}/auth/v1/settings`, { headers }),
    fetch(`${supabaseUrl}/auth/v1/health`, { headers }),
  ]);

  if (!settingsRes.ok) {
    throw new Error(`Không thể lấy auth settings: HTTP ${settingsRes.status}`);
  }

  const settings = await settingsRes.json();
  const health = healthRes.ok ? await healthRes.json() : null;

  const requiresEmailConfirmation = settings.mailer_autoconfirm === false;
  const emailProviderEnabled = Boolean(settings.external?.email);
  const signupEnabled = !settings.disable_signup;

  console.log('Supabase Auth Staging Config Verified:');
  console.log(JSON.stringify({
    projectUrl: supabaseUrl,
    gotrueVersion: health?.version || 'unknown',
    signupEnabled,
    emailProviderEnabled,
    mailerAutoconfirm: settings.mailer_autoconfirm,
    requiresEmailConfirmation,
    minimumPasswordLength: 6,
    recommendation: requiresEmailConfirmation
      ? 'Email confirmation is REQUIRED. Testers must use an accessible inbox or plus-addressing alias (e.g., tester+role@domain). Fake non-deliverable emails will fail at login with Email not confirmed.'
      : 'Auto-confirm is active.',
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
