async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  const eventId = process.env.VITE_EVENT_DATABASE_ID || '1';

  if (!url || !key) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  const eventResponse = await fetch(
    `${url}/rest/v1/SU_KIEN?select=SuKienID,TrangThaiCongBo,TrangThaiMoBan,ThoiGianMoBanVe,ThoiGianDongBanVe&SuKienID=eq.${encodeURIComponent(eventId)}`,
    {headers},
  );

  if (!eventResponse.ok) {
    const detail = await eventResponse.text();
    throw new Error(`Publication policy check failed (${eventResponse.status}): ${detail}`);
  }

  const events = await eventResponse.json();
  if (!Array.isArray(events) || events.length !== 1) {
    throw new Error(`Expected exactly one published event ${eventId}; received ${events.length}.`);
  }

  if (events[0].TrangThaiCongBo !== 'CONG_KHAI') {
    throw new Error(`Event ${eventId} is not public: ${events[0].TrangThaiCongBo}`);
  }

// The expiry worker is intentionally private. An anon browser must not be able
// to invoke it directly. PostgREST can answer 401, 403 or 404 depending on its
// schema cache and privilege configuration.
  const privateRpcResponse = await fetch(`${url}/rest/v1/rpc/expire_seat_holds`, {
    method: 'POST',
    headers: {...headers, 'Content-Type': 'application/json'},
    body: JSON.stringify({p_su_kien_id: Number(eventId)}),
  });

  if (privateRpcResponse.ok) {
    throw new Error('Security check failed: anon can invoke expire_seat_holds.');
  }

  console.log('Supabase public contract verified.');
  console.log(JSON.stringify({
    eventId: events[0].SuKienID,
    publicationStatus: events[0].TrangThaiCongBo,
    saleStatus: events[0].TrangThaiMoBan,
    privateExpiryRpcStatus: privateRpcResponse.status,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
