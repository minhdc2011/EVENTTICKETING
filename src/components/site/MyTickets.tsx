import {useCallback, useEffect, useState} from 'react';
import {formatMoneyVND} from '../../domain/seatMap';
import {navigatePublicRoute} from '../../domain/publicRoute';
import {loadMyTickets, type MyTicket} from '../../services/ticketWalletService';
import './my-tickets.css';

const dateFmt = new Intl.DateTimeFormat('vi-VN', {day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh'});
const timeFmt = new Intl.DateTimeFormat('vi-VN', {hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh'});

function formatNgayGio(iso: string | null): {ngay: string; gio: string} | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {ngay: dateFmt.format(d), gio: timeFmt.format(d)};
}

/** Vạch mã trang trí, sinh cố định từ mã vé (không phải mã quét thật). */
function Vach({seed}: {seed: string}) {
  let h = 7;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bars: number[] = [];
  for (let i = 0; i < 34; i += 1) {
    h = (h * 1103515245 + 12345) >>> 0;
    bars.push(1 + ((h >>> 16) % 3));
  }
  let x = 0;
  return (
    <svg className="et-tk__bars" viewBox={`0 0 ${bars.reduce((a, b) => a + b + 1, 0)} 18`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {bars.map((w, i) => {
        const rect = <rect key={i} x={x} y={0} width={w} height={18} />;
        x += w + 1;
        return rect;
      })}
    </svg>
  );
}

function TicketCard({ve}: {ve: MyTicket}) {
  const gio = formatNgayGio(ve.batDauLuc);
  const dia = [ve.tenSanVanDong, ve.diaDiem].filter(Boolean).join(' · ');
  const shortZone = ve.maKhuVuc.replace(/^SEC_/, '').replace(/_/g, ' ');
  return (
    <div className="et-tk">
      <article className="et-tk__body" aria-label={`Vé ${ve.tenSuKien}, ${ve.laKhuDung ? `khu ${ve.tenKhuVuc}` : `khu ${shortZone} hàng ${ve.soHang} ghế ${ve.soGhe}`}`}>
        <div className="et-tk__event">
          <p className="et-tk__kicker">{ve.tenSuat ?? 'Vé điện tử'}</p>
          <h3 className="et-tk__title">{ve.tenSuKien}</h3>
          {gio ? (
            <p className="et-tk__when">
              {gio.ngay} <span aria-hidden="true">|</span> {gio.gio}
            </p>
          ) : null}
          {dia ? <p className="et-tk__venue">{dia}</p> : null}
          <div className="et-tk__code">
            <Vach seed={ve.maVe || ve.veId} />
            <span>{ve.maVe}</span>
          </div>
        </div>

        <div className="et-tk__stub">
          <dl className="et-tk__grid">
            <div className="et-tk__zone">
              <dt>Khu</dt>
              <dd title={ve.tenKhuVuc}>{shortZone}</dd>
            </div>
            {ve.laKhuDung ? (
              <div>
                <dt>Số lượng</dt>
                <dd>{ve.soLuong}</dd>
              </div>
            ) : (
              <>
                <div>
                  <dt>Hàng</dt>
                  <dd>{ve.soHang}</dd>
                </div>
                <div>
                  <dt>Ghế</dt>
                  <dd>{ve.soGhe}</dd>
                </div>
              </>
            )}
          </dl>
          <p className="et-tk__zone-name">{ve.tenKhuVuc}{ve.laKhuDung ? ' · vé đứng' : ''}</p>
          <p className="et-tk__price">
            <span>{ve.laKhuDung && ve.soLuong > 1 ? `Đơn giá × ${ve.soLuong}` : 'Giá vé'}</span>
            <strong>{ve.donGia === null ? '—' : formatMoneyVND(ve.donGia)}</strong>
          </p>
        </div>
      </article>
    </div>
  );
}

export function MyTickets({userId}: {userId: string}) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tickets, setTickets] = useState<MyTicket[]>([]);

  const load = useCallback(async () => {
    setState('loading');
    try {
      setTickets(await loadMyTickets(userId));
      setState('ready');
    } catch (err) {
      console.error('Không tải được vé đã mua:', err);
      setState('error');
    }
  }, [userId]);

  useEffect(() => {
    let huy = false;
    void (async () => {
      setState('loading');
      try {
        const list = await loadMyTickets(userId);
        if (huy) return;
        setTickets(list);
        setState('ready');
      } catch (err) {
        if (huy) return;
        console.error('Không tải được vé đã mua:', err);
        setState('error');
      }
    })();
    return () => {
      huy = true;
    };
  }, [userId]);

  const tongVe = tickets.reduce((n, v) => n + v.soLuong, 0);

  return (
    <section className="et-mytk" aria-labelledby="mytk-title">
      <div className="et-mytk__head">
        <h2 id="mytk-title">Vé đã mua</h2>
        {state === 'ready' && tickets.length > 0 ? <span className="et-mytk__count">{tongVe} vé</span> : null}
      </div>

      {state === 'loading' ? (
        <p className="et-mytk__note" role="status">Đang tải vé của bạn…</p>
      ) : state === 'error' ? (
        <div className="et-mytk__note" role="alert">
          <p>Không thể tải danh sách vé lúc này.</p>
          <button type="button" className="et-auth__btn et-auth__btn--secondary" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="et-mytk__empty">
          <p className="et-mytk__empty-title">Bạn chưa có vé nào</p>
          <p>Sau khi thanh toán thành công, vé của bạn sẽ hiện ở đây.</p>
          <button type="button" className="et-auth__btn et-auth__btn--primary" onClick={() => navigatePublicRoute('events')}>
            Khám phá sự kiện
          </button>
        </div>
      ) : (
        <ul className="et-mytk__list">
          {tickets.map((ve) => (
            <li key={ve.veId}>
              <TicketCard ve={ve} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
