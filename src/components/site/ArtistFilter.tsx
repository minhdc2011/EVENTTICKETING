import {useId} from 'react';
import type {CatalogArtist} from '../../domain/catalogFilters.js';
import './ArtistFilter.css';

export type ArtistFilterProps = {
  artists: readonly CatalogArtist[];
  value: string;
  onChange: (artistKey: string) => void;
  disabled?: boolean;
};

export function ArtistFilter({artists, value, onChange, disabled = false}: ArtistFilterProps) {
  const selectId = useId();
  const hintId = `${selectId}-hint`;

  const seen = new Set<string>();
  const options = artists.filter((artist) => {
    if (seen.has(artist.key)) return false;
    seen.add(artist.key);
    return true;
  });

  const isEmpty = options.length === 0;
  const selectedKnown = options.some((artist) => artist.key === value);
  const currentValue = selectedKnown ? value : '';

  return (
    <div className="et-artist-filter">
      <div className="et-artist-filter__field">
        <label className="et-artist-filter__label" htmlFor={selectId}>
          Nghệ sĩ
        </label>
        <select
          id={selectId}
          className="et-artist-filter__select"
          value={currentValue}
          disabled={disabled || isEmpty}
          aria-describedby={isEmpty ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Tất cả nghệ sĩ</option>
          {options.map((artist) => (
            <option key={artist.key} value={artist.key} data-artist-id={String(artist.id)}>
              {artist.name}
            </option>
          ))}
        </select>
      </div>
      {isEmpty && (
        <p className="et-artist-filter__hint" id={hintId}>
          Chưa có dữ liệu nghệ sĩ cho các sự kiện này.
        </p>
      )}
      {currentValue && (
        <button type="button" className="et-artist-filter__clear" onClick={() => onChange('')}>
          Bỏ chọn nghệ sĩ
        </button>
      )}
    </div>
  );
}
