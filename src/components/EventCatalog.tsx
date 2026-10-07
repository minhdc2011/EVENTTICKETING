import {useEffect, useMemo, useState} from 'react';
import type * as React from 'react';
import {loadPublicEvents, type PublicEventRecord, type PublicEventSummary} from '../services/eventService';
import {buildPublicPath, navigatePublicRoute} from '../domain/publicRoute';
import {getBuyerSession, signOutBuyer, subscribeBuyerAuth, type BuyerSession} from '../services/buyerAuthService';

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh'});
const categoryLabels: Record<string,string> = {ALL:'Tất cả', AM_NHAC:'Âm nhạc', SAN_KHAU:'Sân khấu', THE_THAO:'Thể thao', HOI_THAO:'Hội thảo', WORKSHOP:'Workshop', THAM_QUAN:'Tham quan', KHAC:'Khác'};

const onSpaNav = (target: string) => (e: React.MouseEvent) => {
  if (!e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    navigatePublicRoute(target);
  }
};

export function EventCatalog() {
  const [events,setEvents]=useState<PublicEventSummary[]>([]);
  const [state,setState]=useState<'loading'|'ready'|'error'>('loading');
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('ALL');
  const [buyerSession, setBuyerSession] = useState<BuyerSession | null>(null);

  useEffect(()=>{
    document.title='EventTicketing — Khám phá sự kiện';
    loadPublicEvents().then(rows=>{setEvents(rows);setState('ready')}).catch(error=>{console.error(error);setState('error')});
    void getBuyerSession().then(setBuyerSession);
    const unsub = subscribeBuyerAuth(setBuyerSession);
    return unsub;
  },[]);

  const filtered=useMemo(()=>events.filter(event=>(category==='ALL'||event.category===category)&&`${event.name} ${event.venueName}`.toLowerCase().includes(query.trim().toLowerCase())),[events,query,category]);
  const featured=events[0];
  const eventHref=(slug:string)=>buildPublicPath(window.location.pathname,`events/${slug}`);
  return <div className="marketplace-shell">
    <header className="marketplace-nav">
      <a href={buildPublicPath(window.location.pathname,'events')} onClick={onSpaNav('events')} className="marketplace-logo">EV<span>ENT</span></a>
      <label className="marketplace-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm sự kiện, địa điểm…" aria-label="Tìm kiếm sự kiện" /></label>
      <nav>
        <a href="#events" className="marketplace-nav-link marketplace-nav-discover">Khám phá</a>
        <a href={buildPublicPath(window.location.pathname,'organizer')} onClick={onSpaNav('organizer')} className="marketplace-organizer-link" title="Khu vực dành cho Ban tổ chức sự kiện">Dành cho BTC</a>
        {buyerSession ? (
          <>
            <a href={buildPublicPath(window.location.pathname,'account')} onClick={onSpaNav('account')} className="marketplace-user-badge" title={buyerSession.email}>
              <span>👤</span> {buyerSession.email.split('@')[0]}
            </a>
            <button type="button" onClick={() => void signOutBuyer()} className="marketplace-logout">Đăng xuất</button>
          </>
        ) : (
          <>
            <a href={buildPublicPath(window.location.pathname,'register')} onClick={onSpaNav('register')} className="marketplace-register">Đăng ký</a>
            <a href={buildPublicPath(window.location.pathname,'login')} onClick={onSpaNav('login')} className="marketplace-login">Đăng nhập</a>
          </>
        )}
      </nav>
    </header>
    {featured&&<section className="marketplace-hero" style={{backgroundImage:`linear-gradient(90deg,rgba(6,8,8,.97) 0%,rgba(6,8,8,.58) 58%,rgba(6,8,8,.28)),url(${featured.bannerUrl||featured.posterUrl||''})`}}>
      <div><p>ĐỀ XUẤT TUẦN NÀY · {categoryLabels[featured.category]||'Sự kiện'}</p><h1>{featured.name}</h1><span>{featured.slogan}</span><dl><div><dt>Thời gian</dt><dd>{dateFormatter.format(new Date(featured.startsAt))}</dd></div><div><dt>Địa điểm</dt><dd>{featured.venueName}</dd></div></dl><a href={eventHref(featured.slug)} onClick={onSpaNav(`events/${featured.slug}`)}>Khám phá sự kiện <b>→</b></a></div>
    </section>}
    <main id="events" className="marketplace-main">
      <div className="marketplace-heading"><div><p>EVENTTICKETING · VIỆT NAM</p><h2>Chọn trải nghiệm<br/>của bạn</h2></div><span>Các sự kiện đã được BTC công bố. Dữ liệu lịch diễn và hạng vé được đồng bộ trực tiếp.</span></div>
      <div className="marketplace-categories">{Object.entries(categoryLabels).map(([key,label])=><button className={category===key?'is-active':''} onClick={()=>setCategory(key)} key={key}>{label}</button>)}</div>
      {state==='loading'&&<div className="event-catalog-state">Đang đồng bộ danh mục…</div>}
      {state==='error'&&<div className="event-catalog-state event-catalog-state--error">Không thể tải danh mục. Vui lòng thử lại.</div>}
      {state==='ready'&&filtered.length===0&&<div className="event-catalog-state">Không tìm thấy sự kiện phù hợp.</div>}
      <section className="marketplace-grid" aria-label="Danh sách sự kiện">{filtered.map(event=><a className="marketplace-card" href={eventHref(event.slug)} onClick={onSpaNav(`events/${event.slug}`)} key={event.id}>
        <div className="marketplace-card-media" style={{backgroundImage:`linear-gradient(0deg,rgba(6,8,8,.7),transparent),url(${event.posterUrl||event.bannerUrl||''})`}}><span>{categoryLabels[event.category]||'Sự kiện'}</span><b>{event.showCount} suất diễn</b></div>
        <div><time>{dateFormatter.format(new Date(event.startsAt))}</time><h3>{event.name}</h3><p>{event.venueName}</p><strong>Xem chi tiết →</strong></div>
      </a>)}</section>
    </main>
    <footer className="marketplace-footer"><b>EVENTTICKETING</b><span>Nền tảng khám phá và quản lý sự kiện.</span><a href={buildPublicPath(window.location.pathname,'organizer')} onClick={onSpaNav('organizer')}>Dành cho Ban tổ chức →</a></footer>
  </div>;
}

export function ShowSwitcher({event}:{event:PublicEventRecord}) {
  if(event.shows.length<2)return null;
  return <nav className="show-switcher" aria-label="Chọn suất diễn"><span>Suất diễn</span>{event.shows.map(show=><a key={show.id} className={show.id===event.selectedShow.id?'is-active':''} href={buildPublicPath(window.location.pathname,`events/${event.slug}/shows/${show.slug}`)} onClick={onSpaNav(`events/${event.slug}/shows/${show.slug}`)}><strong>{show.name}</strong><time dateTime={show.startsAt}>{dateFormatter.format(new Date(show.startsAt))}</time></a>)}</nav>;
}

