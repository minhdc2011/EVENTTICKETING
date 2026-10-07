const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env.local.');
}

const headers = {apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json'};

async function request(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {...options, headers: {...headers, ...options.headers}});
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return {response, body};
}

const eventResult = await request('SU_KIEN?select=SuKienID,Slug,TemplateKey,TheLoai,TrangThaiCongBo&SuKienID=eq.1');
if (!eventResult.response.ok) {
  throw new Error(`Product Foundation schema chưa sẵn sàng: HTTP ${eventResult.response.status} ${JSON.stringify(eventResult.body)}`);
}
const event = eventResult.body?.[0];
if (!event || event.Slug !== 'super-concert-2026' || event.TemplateKey !== 'SUPER_CONCERT_2026') {
  throw new Error(`Backfill Super Concert chưa đạt: ${JSON.stringify(eventResult.body)}`);
}

const showResult = await request('SUAT_DIEN?select=SuatDienID,SuKienID,Slug,TrangThai&SuKienID=eq.1&Slug=eq.dem-chinh');
if (!showResult.response.ok || !showResult.body?.length) {
  throw new Error(`Event 1:N Show chưa sẵn sàng: HTTP ${showResult.response.status} ${JSON.stringify(showResult.body)}`);
}

const anonymousRpc = await request('rpc/tao_to_chuc_cua_toi', {
  method: 'POST',
  body: JSON.stringify({p_ten_to_chuc: 'Anonymous Probe', p_slug: 'anonymous-probe'}),
});
if (anonymousRpc.response.ok || !['42501', 'PGRST301'].includes(String(anonymousRpc.body?.code))) {
  throw new Error(`RPC onboarding không chặn anonymous như mong đợi: HTTP ${anonymousRpc.response.status} ${JSON.stringify(anonymousRpc.body)}`);
}

console.log('Product Foundation staging public contract verified.');
console.log(JSON.stringify({
  eventId: event.SuKienID,
  eventSlug: event.Slug,
  templateKey: event.TemplateKey,
  category: event.TheLoai,
  showSlug: showResult.body[0].Slug,
  anonymousOrganizerRpcStatus: anonymousRpc.response.status,
}, null, 2));
