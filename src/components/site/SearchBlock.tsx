import type {FormEvent} from 'react';
import {IconSearch} from '../common/Icons';
import './site.css';

export type SearchBlockProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
};

export function SearchBlock({value, onChange, onSubmit}: SearchBlockProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit?.();
  };

  return (
    <form className="et-search" role="search" onSubmit={handleSubmit}>
      <label className="et-search__field">
        <IconSearch size={18} />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Tìm theo sự kiện, địa điểm biểu diễn…"
          aria-label="Tìm kiếm sự kiện, địa điểm"
        />
      </label>
      <button type="submit" className="et-search__submit">
        Tìm kiếm
      </button>
    </form>
  );
}
