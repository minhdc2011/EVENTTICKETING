import artistLineupHtml from '../legacy/fragments/artist-lineup.html?raw';
import footerModalsHtml from '../legacy/fragments/footer-modals.html?raw';
import heroHtml from '../legacy/fragments/hero.html?raw';
import pricingHtml from '../legacy/fragments/pricing.html?raw';
import seatingHtml from '../legacy/fragments/seating.html?raw';

type StaticMarkupProps = {
  html: string;
};

/**
 * Transitional boundary for markup that is being migrated from the validated
 * Sprint 1 prototype. `display: contents` avoids introducing layout wrappers.
 */
function StaticMarkup({html}: StaticMarkupProps) {
  return <div style={{display: 'contents'}} dangerouslySetInnerHTML={{__html: html}} />;
}

export function HeroSection() {
  return <StaticMarkup html={heroHtml} />;
}

export function ArtistLineup() {
  return <StaticMarkup html={artistLineupHtml} />;
}

export function PricingSection() {
  return <StaticMarkup html={pricingHtml} />;
}

export function SeatingSection() {
  return <StaticMarkup html={seatingHtml} />;
}

export function FooterAndModals() {
  return <StaticMarkup html={footerModalsHtml} />;
}
