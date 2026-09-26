export function SiteChrome() {
  return (
    <>
      <div id="stA" aria-hidden="true" />
      <div id="stB" aria-hidden="true" />

      <header className="site-header">
        <nav
          className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-5"
          aria-label="Điều hướng chính"
        >
          <a
            href="#concert-hero"
            className="flex items-center gap-3 group"
            aria-label="Super Concert 2026 - Về đầu trang"
          >
            <span className="w-8 h-8 border border-amber-400/60 bg-amber-400 text-black flex items-center justify-center font-black text-xs">
              SC
            </span>
            <span className="site-brand text-white text-sm sm:text-base">
              SUPER CONCERT <span className="text-amber-400">2026</span>
            </span>
          </a>

          <div className="site-nav-desktop flex items-center gap-7">
            <a href="#artist-lineup" className="site-nav-link">Nghệ sĩ</a>
            <a href="#pricing-section" className="site-nav-link">Hạng vé</a>
            <a href="#seating-section" className="site-nav-link">Sơ đồ ghế</a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="btn-view-schedule"
              type="button"
              className="h-9 px-2.5 sm:px-3.5 border border-white/10 hover:border-white/30 text-[10px] sm:text-[11px] font-bold tracking-[.1em] uppercase text-white/70 hover:text-white transition-colors"
            >
              <span className="hidden sm:inline">Timeline</span>
              <span className="sm:hidden">Lịch</span>
            </button>
            <a
              href="#seating-section"
              className="h-9 px-2.5 sm:px-4 border border-white/20 hover:border-amber-400 bg-white/[.035] text-[10px] sm:text-[11px] font-bold tracking-[.1em] uppercase text-white flex items-center gap-2 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">Chọn vé ngay</span>
              <span className="sm:hidden">Vé</span>
            </a>
          </div>
        </nav>
      </header>
    </>
  );
}
