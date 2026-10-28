import {useEffect, useMemo, useState} from 'react';
import type * as React from 'react';
import {loadPublicEvents, type PublicEventRecord, type PublicEventSummary} from '../services/eventService';
import {buildPublicPath, navigatePublicRoute} from '../domain/publicRoute';
import {getBuyerSession, signOutBuyer, subscribeBuyerAuth, type BuyerSession} from '../services/buyerAuthService';
import {CATEGORY_THEMES, CATEGORY_KEYS, getCategoryTheme} from '../domain/categoryThemes.js';
import {
  CategoryIcon,
  IconArrowRight,
  IconBuilding,
  IconCalendar,
  IconClose,
  IconHeadphones,
  IconMapPin,
  IconSearch,
  IconShieldCheck,
  IconTicket,
  IconUser,
} from './common/Icons';

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const onSpaNav = (target: string) => (e: React.MouseEvent) => {
  if (!e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    navigatePublicRoute(target);
  }
};

export function EventCatalog() {
  const [events, setEvents] = useState<PublicEventSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [buyerSession, setBuyerSession] = useState<BuyerSession | null>(null);

  const fetchEvents = () => {
    setState('loading');
    loadPublicEvents()
      .then((rows) => {
        setEvents(rows);
        setState('ready');
      })
      .catch((error) => {
        console.error('Không thể tải danh sách sự kiện:', error);
        setState('error');
      });
  };

  useEffect(() => {
    document.title = 'EventTicketing — Khám phá sự kiện';
    fetchEvents();
    void getBuyerSession().then(setBuyerSession);
    const unsub = subscribeBuyerAuth(setBuyerSession);
    return unsub;
  }, []);

  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = {ALL: events.length};
    for (const key of CATEGORY_KEYS) {
      counts[key] = 0;
    }
    for (const ev of events) {
      const themeKey = getCategoryTheme(ev.category).key;
      counts[themeKey] = (counts[themeKey] || 0) + 1;
    }
    return counts;
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      const catMatch = category === 'ALL' || getCategoryTheme(event.category).key === category;
      const searchMatch = !q || `${event.name} ${event.venueName || ''}`.toLowerCase().includes(q);
      return catMatch && searchMatch;
    });
  }, [events, query, category]);

  const featured = events[0];
  const featuredTheme = featured ? getCategoryTheme(featured.category) : null;
  const eventHref = (slug: string) => buildPublicPath(window.location.pathname, `events/${slug}`);

  return (
    <div className="marketplace-shell">
      {/* Top Navigation */}
      <header className="marketplace-nav">
        <a
          href={buildPublicPath(window.location.pathname, 'events')}
          onClick={onSpaNav('events')}
          className="marketplace-logo"
          aria-label="EventTicketing Trang chủ"
        >
          EV<span>ENT</span><span className="marketplace-logo-sub">TICKETING</span>
        </a>

        {/* Discovery Search Input */}
        <label className="marketplace-search" aria-label="Tìm kiếm sự kiện">
          <IconSearch size={18} className="marketplace-search-icon" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo sự kiện, địa điểm biểu diễn…"
            aria-label="Tìm kiếm sự kiện, địa điểm"
          />
          {query && (
            <button
              type="button"
              className="marketplace-search-clear"
              onClick={() => setQuery('')}
              aria-label="Xóa từ khóa tìm kiếm"
            >
              <IconClose size={16} />
            </button>
          )}
        </label>

        <nav aria-label="Điều hướng người dùng">
          <a href="#events" className="marketplace-nav-link marketplace-nav-discover">
            Khám phá
          </a>
          <a
            href={buildPublicPath(window.location.pathname, 'organizer')}
            onClick={onSpaNav('organizer')}
            className="marketplace-organizer-link"
            title="Khu vực quản lý và phát hành vé dành cho Ban tổ chức"
          >
            Dành cho BTC
          </a>
          {buyerSession ? (
            <>
              <a
                href={buildPublicPath(window.location.pathname, 'account')}
                onClick={onSpaNav('account')}
                className="marketplace-user-badge"
                title={buyerSession.email}
              >
                <IconUser size={14} />
                <span>{buyerSession.email.split('@')[0]}</span>
              </a>
              <button
                type="button"
                onClick={() => void signOutBuyer()}
                className="marketplace-logout"
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <a
                href={buildPublicPath(window.location.pathname, 'register')}
                onClick={onSpaNav('register')}
                className="marketplace-register"
              >
                Đăng ký
              </a>
              <a
                href={buildPublicPath(window.location.pathname, 'login')}
                onClick={onSpaNav('login')}
                className="marketplace-login"
              >
                Đăng nhập
              </a>
            </>
          )}
        </nav>
      </header>

      {/* Featured / Hero Area */}
      {featured && featuredTheme && (
        <section
          className="marketplace-hero"
          style={{
            ['--hero-bg-img' as any]: `url(${featured.bannerUrl || featured.posterUrl || ''})`,
          }}
          aria-label="Sự kiện nổi bật tuần này"
        >
          <div className="marketplace-hero-ambient" aria-hidden="true" style={{background: featuredTheme.glow}} />

          {/* Mobile image cover */}
          <div
            className="marketplace-hero-cover-mobile"
            style={{backgroundImage: `url(${featured.bannerUrl || featured.posterUrl || ''})`}}
            aria-hidden="true"
          >
            <div className="marketplace-hero-cover-overlay" />
            <span
              className="marketplace-hero-cat-badge marketplace-hero-cat-badge--mobile"
              style={{
                backgroundColor: featuredTheme.badgeBg,
                borderColor: featuredTheme.badgeBorder,
                color: featuredTheme.badgeText,
              }}
            >
              <CategoryIcon category={featured.category} size={12} />
              <span>{featuredTheme.label}</span>
            </span>
          </div>

          <div className="marketplace-hero-content">
            <div className="marketplace-hero-kicker-row">
              <span
                className="marketplace-hero-cat-badge marketplace-hero-cat-badge--desktop"
                style={{
                  backgroundColor: featuredTheme.badgeBg,
                  borderColor: featuredTheme.badgeBorder,
                  color: featuredTheme.badgeText,
                }}
              >
                <CategoryIcon category={featured.category} size={13} />
                <span>{featuredTheme.label}</span>
              </span>
              <span className="marketplace-hero-kicker">ĐỀ XUẤT TUẦN NÀY</span>
            </div>

            <h1 className="marketplace-hero-title">{featured.name}</h1>
            {featured.slogan && <span className="marketplace-hero-slogan">{featured.slogan}</span>}

            <dl className="marketplace-hero-meta">
              <div>
                <dt>
                  <IconCalendar size={13} /> Thời gian
                </dt>
                <dd>{dateFormatter.format(new Date(featured.startsAt))}</dd>
              </div>
              <div>
                <dt>
                  <IconMapPin size={13} /> Địa điểm
                </dt>
                <dd>{featured.venueName || 'Địa điểm thông báo sau'}</dd>
              </div>
              {featured.showCount > 1 && (
                <div className="marketplace-hero-meta-shows">
                  <dt>
                    <IconTicket size={13} /> Suất diễn
                  </dt>
                  <dd>{featured.showCount} suất diễn sẵn sàng</dd>
                </div>
              )}
            </dl>

            <div className="marketplace-hero-actions">
              <a
                href={eventHref(featured.slug)}
                onClick={onSpaNav(`events/${featured.slug}`)}
                className="marketplace-hero-cta"
                style={{
                  backgroundColor: featuredTheme.primary,
                  color: featuredTheme.key === 'AM_NHAC' ? '#070908' : '#ffffff',
                  boxShadow: `0 8px 24px ${featuredTheme.glow}`,
                }}
              >
                <span>Khám phá sự kiện ngay</span>
                <IconArrowRight size={16} />
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Trust & Reassurance Strip */}
      <section className="marketplace-trust-strip" aria-label="Cam kết dịch vụ">
        <div className="marketplace-trust-inner">
          <div className="marketplace-trust-item">
            <div className="marketplace-trust-icon">
              <IconBuilding size={20} />
            </div>
            <div>
              <strong>Sự kiện từ Ban tổ chức</strong>
              <span>Thông tin chính thức phát hành trực tiếp từ các tổ chức đã xác minh</span>
            </div>
          </div>
          <div className="marketplace-trust-item">
            <div className="marketplace-trust-icon">
              <IconCalendar size={20} />
            </div>
            <div>
              <strong>Lịch diễn đa suất minh bạch</strong>
              <span>Cập nhật khung giờ biểu diễn và lịch trình theo từng suất</span>
            </div>
          </div>
          <div className="marketplace-trust-item">
            <div className="marketplace-trust-icon">
              <IconTicket size={20} />
            </div>
            <div>
              <strong>Phân khu & Tồn kho thực tế</strong>
              <span>Dữ liệu hạng vé, giá niêm yết và trạng thái bán vé trực tiếp</span>
            </div>
          </div>
          <div className="marketplace-trust-item">
            <div className="marketplace-trust-icon">
              <IconShieldCheck size={20} />
            </div>
            <div>
              <strong>Phân quyền & Phiên làm việc</strong>
              <span>Phân tách vai trò an toàn giữa người mua và Ban tổ chức qua RLS</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Catalog Discovery */}
      <main id="events" className="marketplace-main">
        <div className="marketplace-heading">
          <div>
            <p className="marketplace-eyebrow">EVENTTICKETING · VIỆT NAM</p>
            <h2>Chọn trải nghiệm<br />của bạn</h2>
          </div>
          <span>
            Các sự kiện đã được Ban tổ chức công bố chính thức. Dữ liệu lịch diễn, sơ đồ khán đài và tồn kho hạng vé được cập nhật tức thời.
          </span>
        </div>

        {/* Category Filter Pills */}
        <div className="marketplace-categories" role="tablist" aria-label="Phân loại thể loại sự kiện">
          <button
            type="button"
            className={category === 'ALL' ? 'is-active' : ''}
            onClick={() => setCategory('ALL')}
            role="tab"
            aria-selected={category === 'ALL'}
          >
            <span>Tất cả</span>
            <span className="marketplace-cat-count">{countsByCategory.ALL || 0}</span>
          </button>
          {CATEGORY_KEYS.map((key) => {
            const theme = CATEGORY_THEMES[key];
            const isActive = category === key;
            const count = countsByCategory[key] || 0;
            return (
              <button
                key={key}
                type="button"
                className={isActive ? 'is-active' : ''}
                style={
                  isActive
                    ? {
                        backgroundColor: theme.primary,
                        borderColor: theme.primaryLight,
                        color: theme.key === 'AM_NHAC' ? '#070908' : '#ffffff',
                        boxShadow: `0 4px 14px ${theme.glow}`,
                      }
                    : undefined
                }
                onClick={() => setCategory(key)}
                role="tab"
                aria-selected={isActive}
              >
                <CategoryIcon category={key} size={14} />
                <span>{theme.label}</span>
                <span className="marketplace-cat-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Query feedback */}
        {query.trim() && (
          <div className="marketplace-query-feedback">
            <span>
              Kết quả tìm kiếm cho: <strong>"{query}"</strong> ({filtered.length} sự kiện)
            </span>
            <button type="button" onClick={() => setQuery('')}>
              Xóa từ khóa
            </button>
          </div>
        )}

        {/* Loading / Error / Empty States */}
        {state === 'loading' && (
          <div className="marketplace-state-box">
            <div className="marketplace-spinner" aria-hidden="true" />
            <p>Đang đồng bộ danh mục sự kiện từ hệ thống…</p>
          </div>
        )}

        {state === 'error' && (
          <div className="event-catalog-state event-catalog-state--error">
            <p>Không thể tải danh mục sự kiện vào lúc này.</p>
            <button type="button" onClick={fetchEvents} className="marketplace-retry-btn">
              Thử lại ngay
            </button>
          </div>
        )}

        {state === 'ready' && filtered.length === 0 && (
          <div className="event-catalog-state marketplace-empty-box">
            <p>Không tìm thấy sự kiện nào phù hợp với lựa chọn hiện tại.</p>
            {(query || category !== 'ALL') && (
              <button
                type="button"
                className="marketplace-reset-btn"
                onClick={() => {
                  setQuery('');
                  setCategory('ALL');
                }}
              >
                Xem tất cả sự kiện
              </button>
            )}
          </div>
        )}

        {/* Event Cards Grid */}
        <section className="marketplace-grid" aria-label="Danh sách sự kiện">
          {filtered.map((event) => {
            const theme = getCategoryTheme(event.category);
            return (
              <a
                className="marketplace-card"
                href={eventHref(event.slug)}
                onClick={onSpaNav(`events/${event.slug}`)}
                key={event.id}
                data-category={theme.key}
                style={
                  {
                    '--card-accent': theme.primary,
                    '--card-glow': theme.glow,
                    '--card-border': theme.cardBorder,
                  } as React.CSSProperties
                }
              >
                {/* Top Category Accent Line */}
                <div
                  className="marketplace-card-stripe"
                  style={{backgroundColor: theme.primary}}
                  aria-hidden="true"
                />

                {/* Media area */}
                <div
                  className="marketplace-card-media"
                  style={{
                    backgroundImage: event.posterUrl || event.bannerUrl
                      ? `linear-gradient(180deg, rgba(0, 0, 0, 0.2) 0%, rgba(6, 8, 12, 0.88) 100%), url(${
                          event.posterUrl || event.bannerUrl
                        })`
                      : theme.gradient,
                  }}
                >
                  <span
                    className="marketplace-card-badge"
                    style={{
                      backgroundColor: theme.badgeBg,
                      borderColor: theme.badgeBorder,
                      color: theme.badgeText,
                    }}
                  >
                    <CategoryIcon category={event.category} size={12} />
                    <span>{theme.label}</span>
                  </span>

                  <b className="marketplace-card-shows">
                    {event.showCount} suất diễn
                  </b>
                </div>

                {/* Event info */}
                <div className="marketplace-card-body">
                  <time className="marketplace-card-time" style={{color: theme.primaryLight}}>
                    <IconCalendar size={12} />
                    <span>{dateFormatter.format(new Date(event.startsAt))}</span>
                  </time>
                  <h3 className="marketplace-card-title">{event.name}</h3>
                  <p className="marketplace-card-venue">
                    <IconMapPin size={13} />
                    <span>{event.venueName || 'Địa điểm thông báo sau'}</span>
                  </p>
                  <div className="marketplace-card-footer">
                    <span className="marketplace-card-action" style={{color: theme.primaryLight}}>
                      Xem chi tiết <IconArrowRight size={13} />
                    </span>
                  </div>
                </div>
              </a>
            );
          })}
        </section>
      </main>

      {/* Trustworthy Marketplace Footer */}
      <footer className="marketplace-footer">
        <div className="marketplace-footer-grid">
          <div className="marketplace-footer-brand-col">
            <b className="marketplace-footer-brand">
              EV<span>ENT</span>TICKETING
            </b>
            <p className="marketplace-footer-slogan">
              Nền tảng khám phá sự kiện, đặt vé an toàn và quản lý bán vé đa suất diễn tiêu chuẩn tại Việt Nam.
            </p>
            <div className="marketplace-footer-trust-marks">
              <span>● Đồng bộ trực tiếp từ Ban tổ chức</span>
              <span>● Bảo vệ quyền lợi khán giả</span>
            </div>
          </div>

          <div className="marketplace-footer-nav-col">
            <h4>Dành cho Khán giả</h4>
            <ul>
              <li>
                <a href="#events">Khám phá sự kiện</a>
              </li>
              <li>
                <a
                  href={buildPublicPath(window.location.pathname, 'account')}
                  onClick={onSpaNav('account')}
                >
                  Tài khoản cá nhân
                </a>
              </li>
              <li>
                <a
                  href={buildPublicPath(window.location.pathname, 'login')}
                  onClick={onSpaNav('login')}
                >
                  Đăng nhập khán giả
                </a>
              </li>
            </ul>
          </div>

          <div className="marketplace-footer-nav-col">
            <h4>Dành cho Ban tổ chức</h4>
            <ul>
              <li>
                <a
                  href={buildPublicPath(window.location.pathname, 'organizer')}
                  onClick={onSpaNav('organizer')}
                >
                  Studio quản lý sự kiện
                </a>
              </li>
              <li>
                <a
                  href={buildPublicPath(window.location.pathname, 'organizer/login')}
                  onClick={onSpaNav('organizer/login')}
                >
                  Đăng nhập tài khoản BTC
                </a>
              </li>
            </ul>
          </div>

          <div className="marketplace-footer-nav-col">
            <h4>Hỗ trợ & Liên hệ</h4>
            <div className="marketplace-footer-contact">
              <p>
                <strong>Hotline CSKH:</strong> 1900 6868 (8:00 - 22:00)
              </p>
              <p>
                <strong>Email:</strong> support@eventticketing.vn
              </p>
              <p className="marketplace-footer-address">
                Hà Nội & TP. Hồ Chí Minh, Việt Nam
              </p>
            </div>
          </div>
        </div>

        <div className="marketplace-footer-bottom">
          <span>© 2026 EventTicketing Platform. Tất cả các quyền được bảo lưu.</span>
          <a
            href={buildPublicPath(window.location.pathname, 'organizer')}
            onClick={onSpaNav('organizer')}
            className="marketplace-footer-btc-link"
          >
            Cổng tiếp nhận đối tác Ban tổ chức →
          </a>
        </div>
      </footer>
    </div>
  );
}

export function ShowSwitcher({event}: {event: PublicEventRecord}) {
  if (event.shows.length < 2) return null;
  return (
    <nav className="show-switcher" aria-label="Chọn suất diễn">
      <span className="show-switcher-label">Suất diễn</span>
      {event.shows.map((show) => (
        <a
          key={show.id}
          className={show.id === event.selectedShow.id ? 'is-active' : ''}
          href={buildPublicPath(window.location.pathname, `events/${event.slug}/shows/${show.slug}`)}
          onClick={onSpaNav(`events/${event.slug}/shows/${show.slug}`)}
        >
          <strong>{show.name}</strong>
          <time dateTime={show.startsAt}>{dateFormatter.format(new Date(show.startsAt))}</time>
        </a>
      ))}
    </nav>
  );
}
