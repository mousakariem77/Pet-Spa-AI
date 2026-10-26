import React from 'react'

/**
 * Component Logo chính thức cho Pet Spa AI
 * Kết hợp biểu tượng giọt nước spa thư giãn + bàn chân bé cưng + ngôi sao AI lấp lánh
 */
export function LogoMark({ size = 36, className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', flexShrink: 0, borderRadius: Math.round(size * 0.25), ...style }}
    >
      <defs>
        <linearGradient id="logoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="55%" stopColor="#0f8b8d" />
          <stop offset="100%" stopColor="#0b3d3f" />
        </linearGradient>
        <linearGradient id="logoSparkle" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="logoPaw" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ecfeff" />
        </linearGradient>
        <filter id="logoShadow" x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#042f2e" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Khối nền Squircle gradient */}
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#logoBgGrad)" />
      
      {/* Viền sáng nổi bật */}
      <rect x="2.5" y="2.5" width="59" height="59" rx="15.5" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1" />

      {/* Bọt nước Spa thư giãn */}
      <circle cx="16" cy="17" r="4.2" fill="#ffffff" fillOpacity="0.2" />
      <circle cx="14.8" cy="15.8" r="1.2" fill="#ffffff" fillOpacity="0.6" />
      <circle cx="48" cy="46" r="3.2" fill="#ffffff" fillOpacity="0.18" />

      {/* Bàn chân thú cưng */}
      <g fill="url(#logoPaw)" filter="url(#logoShadow)">
        <ellipse cx="20" cy="25" rx="3.8" ry="5.2" transform="rotate(-18 20 25)" />
        <ellipse cx="28" cy="20.5" rx="4" ry="5.8" />
        <ellipse cx="36" cy="20.5" rx="4" ry="5.8" />
        <ellipse cx="44" cy="25" rx="3.8" ry="5.2" transform="rotate(18 44 25)" />
        <path d="M32 29.5 C22.8 29.5 19 35.8 20.8 43.5 C22.2 48.5 27.5 49.8 32 47.2 C36.5 49.8 41.8 48.5 43.2 43.5 C45 35.8 41.2 29.5 32 29.5 Z" />
      </g>

      {/* Ngôi sao công nghệ AI Sparkle */}
      <path d="M49 8 C49 12.5 52.5 14.5 56 14.5 C52.5 14.5 49 16.5 49 21 C49 16.5 45.5 14.5 42 14.5 C45.5 14.5 49 12.5 49 8 Z" fill="url(#logoSparkle)" />
      <circle cx="53.5" cy="8.5" r="1.3" fill="#fef08a" />
    </svg>
  )
}

export default function Logo({
  size = 36,
  showText = true,
  subtitle = null,
  theme = 'dark', // 'dark' | 'light'
  style = {},
  className = '',
}) {
  const isDark = theme === 'dark'

  return (
    <div
      className={`petspa-logo-wrap ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size >= 40 ? 12 : 10,
        textDecoration: 'none',
        userSelect: 'none',
        ...style,
      }}
    >
      <LogoMark size={size} />

      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: size >= 40 ? 20 : 17,
                fontWeight: 800,
                letterSpacing: '-0.3px',
                color: isDark ? '#ffffff' : '#0b3d3f',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              Pet Spa
            </span>
            <span
              style={{
                fontSize: size >= 40 ? 12 : 11,
                fontWeight: 800,
                color: '#ffffff',
                background: 'linear-gradient(135deg, #14b8a6, #0f8b8d)',
                padding: '2px 6px',
                borderRadius: 6,
                letterSpacing: '0.5px',
                boxShadow: '0 2px 6px rgba(15, 139, 141, 0.35)',
              }}
            >
              AI
            </span>
          </div>

          {subtitle && (
            <span
              style={{
                fontSize: size >= 40 ? 11 : 10,
                fontWeight: 500,
                color: isDark ? '#94a3b8' : '#64748b',
                marginTop: 2,
                letterSpacing: '0.2px',
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
