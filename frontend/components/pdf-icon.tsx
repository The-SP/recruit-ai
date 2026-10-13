// Colour PDF file glyph: the resume sheet's "view original" toggle. A generic
// file-type mark, deliberately without Adobe's Acrobat swirl.
export function PdfIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="pdf-icon-page" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E5E7EB" />
        </linearGradient>
        <linearGradient id="pdf-icon-banner" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#EF4444" />
          <stop offset="1" stopColor="#B91C1C" />
        </linearGradient>
      </defs>
      {/* Page with a folded top-right corner */}
      <path
        d="M5 1.75h10.25L20 6.5v15a.75.75 0 0 1-.75.75H5a.75.75 0 0 1-.75-.75v-19A.75.75 0 0 1 5 1.75z"
        fill="url(#pdf-icon-page)"
        stroke="#9CA3AF"
        strokeWidth="0.75"
      />
      <path d="M15.25 1.75V5.75a.75.75 0 0 0 .75.75h4z" fill="#D1D5DB" stroke="#9CA3AF" strokeWidth="0.75" strokeLinejoin="round" />
      {/* Banner overhangs the page's left edge; sized so "PDF" stays legible at icon size */}
      <rect x="0.75" y="8" width="20.5" height="9" rx="1" fill="url(#pdf-icon-banner)" />
      <text
        x="11"
        y="15.3"
        textAnchor="middle"
        fill="#FFFFFF"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="800"
        fontSize="8"
        letterSpacing="0.1"
      >
        PDF
      </text>
      <rect x="7" y="19.25" width="9" height="1" rx="0.5" fill="#D1D5DB" />
    </svg>
  );
}
