import type { PiktogrammId } from '@fmt/core';

interface Props {
  type: PiktogrammId;
  size?: number;
}

/** 12 reduced editorial vector pictograms matching the FMT domain palette. */
export function MethodPictogram({ type, size = 34 }: Props) {
  const stroke = 'currentColor';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, color: 'var(--ink)' }}
    >
      <rect x="1.5" y="1.5" width="33" height="33" rx="7" fill="var(--paper)" stroke="var(--rule)" strokeWidth="1.2" />
      {type === 'vortrag' && (
        <>
          <rect x="7" y="8" width="22" height="13" rx="2" fill="var(--dA-soft)" stroke="var(--dA)" strokeWidth="1.5" />
          <path d="M12 14h12M12 17h7" stroke="var(--dA)" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="18" cy="25.5" r="2.2" fill={stroke} />
          <path d="M13 30c1-2 9-2 10 0" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
      {type === 'dialog' && (
        <>
          <rect x="6" y="9" width="14" height="10" rx="3" fill="var(--dC-soft)" stroke="var(--dC)" strokeWidth="1.5" />
          <rect x="16" y="16" width="14" height="10" rx="3" fill="var(--dA-soft)" stroke="var(--dA)" strokeWidth="1.5" />
          <path d="M10 14h6M20 21h6" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
      {type === 'gruppen' && (
        <>
          <circle cx="18" cy="11" r="3" fill="var(--dC-soft)" stroke="var(--dC)" strokeWidth="1.5" />
          <circle cx="10.5" cy="22.5" r="3" fill="var(--dA-soft)" stroke="var(--dA)" strokeWidth="1.5" />
          <circle cx="25.5" cy="22.5" r="3" fill="var(--dB-soft)" stroke="var(--dB)" strokeWidth="1.5" />
          <path d="M16 13.5l-3.5 6.5M20 13.5l3.5 6.5M13.5 22.5h9" stroke={stroke} strokeWidth="1.3" />
        </>
      )}
      {type === 'stationen' && (
        <>
          <rect x="6" y="7" width="9" height="9" rx="2" fill="var(--dA-soft)" stroke="var(--dA)" strokeWidth="1.4" />
          <rect x="21" y="7" width="9" height="9" rx="2" fill="var(--dC-soft)" stroke="var(--dC)" strokeWidth="1.4" />
          <rect x="6" y="20" width="9" height="9" rx="2" fill="var(--dB-soft)" stroke="var(--dB)" strokeWidth="1.4" />
          <rect x="21" y="20" width="9" height="9" rx="2" fill="var(--dD-soft)" stroke="var(--dD)" strokeWidth="1.4" />
          <path d="M15 11.5h6M25.5 16v4M21 24.5h-6" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}
      {type === 'experiment' && (
        <>
          <path d="M14 8h8M16 8v6l-6 12a2 2 0 0 0 1.8 2.9h12.4A2 2 0 0 0 26 26l-6-12V8" stroke="var(--dC)" strokeWidth="1.6" fill="var(--dC-soft)" strokeLinejoin="round" />
          <circle cx="16.5" cy="22" r="1.4" fill="var(--dA)" />
          <circle cx="20.5" cy="24.5" r="1.2" fill="var(--dA)" />
        </>
      )}
      {type === 'projekt' && (
        <>
          <rect x="7" y="8" width="22" height="20" rx="2.5" fill="var(--dB-soft)" stroke="var(--dB)" strokeWidth="1.5" />
          <path d="M11 14l2.5 2.5L17 13M20 14.5h5M11 21l2.5 2.5L17 20M20 21.5h5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {type === 'quiz' && (
        <>
          <circle cx="18" cy="18" r="10.5" fill="var(--dA-soft)" stroke="var(--dA)" strokeWidth="1.5" />
          <path d="M14.8 14.8a3.2 3.2 0 1 1 4.6 2.8c-1 .5-1.4 1.1-1.4 2.1" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="18" cy="23.5" r="1.2" fill={stroke} />
        </>
      )}
      {type === 'reflexion' && (
        <>
          <circle cx="18" cy="18" r="9.5" fill="var(--dD-soft)" stroke="var(--dD)" strokeWidth="1.5" />
          <path d="M18 11v7l4.5 3" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {type === 'rolle' && (
        <>
          <circle cx="13.5" cy="15.5" r="5.5" fill="var(--dD-soft)" stroke="var(--dD)" strokeWidth="1.5" />
          <circle cx="22.5" cy="20.5" r="5.5" fill="var(--dB-soft)" stroke="var(--dB)" strokeWidth="1.5" />
          <path d="M11.5 16.5c1 1.2 3 1.2 4 0M20.5 22c1-1.2 3-1.2 4 0" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}
      {type === 'visualisierung' && (
        <>
          <circle cx="18" cy="18" r="3.5" fill="var(--dA-soft)" stroke="var(--dA)" strokeWidth="1.5" />
          <circle cx="9.5" cy="10.5" r="2.3" fill="var(--dC-soft)" stroke="var(--dC)" strokeWidth="1.3" />
          <circle cx="26.5" cy="10.5" r="2.3" fill="var(--dB-soft)" stroke="var(--dB)" strokeWidth="1.3" />
          <circle cx="26.5" cy="25.5" r="2.3" fill="var(--dD-soft)" stroke="var(--dD)" strokeWidth="1.3" />
          <circle cx="9.5" cy="25.5" r="2.3" fill="var(--dA-soft)" stroke="var(--dA)" strokeWidth="1.3" />
          <path d="M15.2 15.6L11.2 12.2M20.8 15.6l4-3.4M20.8 20.4l4 3.4M15.2 20.4l-4 3.4" stroke={stroke} strokeWidth="1.2" />
        </>
      )}
      {type === 'debatte' && (
        <>
          <path d="M18 8v20M10 13h16" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M10 13l-3 7h6l-3-7z" fill="var(--dC-soft)" stroke="var(--dC)" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M26 13l-3 7h6l-3-7z" fill="var(--dD-soft)" stroke="var(--dD)" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M13 28h10" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {type === 'ki' && (
        <>
          <rect x="10" y="10" width="16" height="16" rx="3" fill="var(--dD-soft)" stroke="var(--dD)" strokeWidth="1.6" />
          <circle cx="18" cy="18" r="3" fill="var(--dA)" />
          <path d="M14 6v4M22 6v4M14 26v4M22 26v4M6 14h4M6 22h4M26 14h4M26 22h4" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
