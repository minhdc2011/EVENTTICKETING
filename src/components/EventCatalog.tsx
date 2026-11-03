import {useEffect, useMemo, useState, type MouseEvent} from 'react';
import {loadPublicEvents, type PublicEventSummary} from '../services/eventService';
import {buildPublicPath, navigatePublicRoute} from '../domain/publicRoute';
import {pickFeaturedEvent} from './event-template/eventTemplateLogic.js';
import {EventRow} from './site/EventRow';
import {FeaturedEvent} from './site/FeaturedEvent';
import {getBuyerSession, signOutBuyer, subscribeBuyerAuth, type BuyerSession} from '../services/buyerAuthService';
import {CATEGORY_THEMES, CATEGORY_KEYS, getCategoryTheme} from '../domain/categoryThemes.js';
import {GlobalHeader} from './site/GlobalHeader';
import {SearchBlock} from './site/SearchBlock';
import {
  CategoryIcon,
  IconBuilding,
  IconCalendar,
  IconShieldCheck,
  IconTicket,
} from './common/Icons';

const onSpaNav = (target: string) => (e: MouseEvent<HTMLAnchorElement>) => {
  if (!e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    navigatePublicRoute(target);
  }
};

function countEventsByCategory(events: PublicEventSummary[]): Record<string, number> {
  const counts: Record<string, number> = {ALL: events.length};
  for (const key of CATEGORY_KEYS) {
    counts[key] = 0;
  }
  for (const ev of events) {
    const themeKey = getCategoryTheme(ev.category).key;
    counts[themeKey] = (counts[themeKey] || 0) + 1;
  }
  return counts;
}

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

  const handleSignOut = async () => {
    await signOutBuyer();
    setBuyerSession(await getBuyerSession());
  };

  const isReady = state === 'ready';
  const countsByCategory = useMemo(() => countEventsByCategory(events), [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      const catMatch = category === 'ALL' || getCategoryTheme(event.category).key === category;
      const searchMatch = !q || `${event.name} ${event.venueName || ''}`.toLowerCase().includes(q);
      return catMatch && searchMatch;
    });
  }, [events, query, category]);

  const featured = useMemo(() => pickFeaturedEvent(events), [events]);

  return (
    <div className="et-site et-catalog">
      <GlobalHeader
        session={buyerSession}
        onSignOut={handleSignOut}
        categories={CATEGORY_KEYS.map((k) => ({key: k, label: CATEGORY_THEMES[k].label}))}
        activeCategory={category}
        onCategorySelect={setCategory}
      />
      <SearchBlock
        value={query}
        onChange={setQuery}
        onSubmit={() => document.getElementById('events')?.scrollIntoView()}
      />

      {/* Featured / Hero Area */}
      <FeaturedEvent event={featured} />

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
        <div className="marketplace-categories" role="group" aria-label="Lọc theo thể loại">
          <button
            type="button"
            className={category === 'ALL' ? 'is-active' : ''}
            onClick={() => setCategory('ALL')}
            aria-pressed={category === 'ALL'}
          >
            <span>Tất cả</span>
            {isReady && <span className="marketplace-cat-count">{countsByCategory.ALL || 0}</span>}
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
                aria-pressed={isActive}
              >
                <CategoryIcon category={key} size={14} />
                <span>{theme.label}</span>
                {isReady && <span className="marketplace-cat-count">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Query feedback */}
        {isReady && query.trim() && (
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
          <div className="marketplace-state-box" role="status">
            <div className="marketplace-spinner" aria-hidden="true" />
            <p>Đang đồng bộ danh mục sự kiện từ hệ thống…</p>
          </div>
        )}

        {state === 'error' && (
          <div className="event-catalog-state event-catalog-state--error" role="alert">
            <p>Không thể tải danh mục sự kiện vào lúc này.</p>
            <button type="button" onClick={fetchEvents} className="marketplace-retry-btn">
              Thử lại
            </button>
          </div>
        )}

        {isReady && events.length === 0 && (
          <div className="event-catalog-state marketplace-empty-box">
            <p>Chưa có sự kiện nào được công bố</p>
          </div>
        )}

        {isReady && events.length > 0 && filtered.length === 0 && (
          <div className="event-catalog-state marketplace-empty-box">
            <p>Không tìm thấy sự kiện phù hợp</p>
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
          </div>
        )}

        {/* Event Cards Grid */}
        {isReady && filtered.length > 0 && (
        <section className="et-event-list" aria-label="Danh sách sự kiện">
          {filtered.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </section>
        )}
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

export {ShowSwitcher} from './event-template/ShowSwitcher';
