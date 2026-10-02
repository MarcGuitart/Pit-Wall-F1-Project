/**
 * An original front-view single-seater silhouette, drawn in SVG — not a photo,
 * not an official render, not any team's or series' livery. Every shape below
 * is this project's own geometry, styled with the pit wall's own palette
 * (tailwind.config.ts: bg/border/signal tokens), with no text, no numbers and
 * no logos anywhere in it.
 *
 * Front view specifically: the opening/transition animations (Block 24) scale
 * this up from small, and a front-on silhouette — wing, nose, halo, two front
 * tyres — reads correctly at every size from a dot to full-bleed, which a
 * three-quarter or side view would not (foreshortening only works from one
 * distance). The shape is symmetric about x=120, so scaling from its own
 * center looks like the car coming toward the viewer, not sliding into frame.
 */
type CarSilhouetteProps = {
  className?: string
  /** aria-hidden by default — this is decorative, never the page's content. */
  title?: string
}

export function CarSilhouette({ className, title }: CarSilhouetteProps) {
  return (
    <svg
      viewBox="0 0 240 200"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}

      {/* front tyres — behind everything else, flattened ellipses for a
          front-on, slightly-ground-level read */}
      <ellipse cx="62" cy="150" rx="22" ry="30" fill="#181C23" stroke="#252D3A" strokeWidth="2" />
      <ellipse cx="178" cy="150" rx="22" ry="30" fill="#181C23" stroke="#252D3A" strokeWidth="2" />
      {/* tyre sidewall highlight */}
      <ellipse cx="62" cy="150" rx="10" ry="16" fill="none" stroke="#1E2430" strokeWidth="1.5" />
      <ellipse cx="178" cy="150" rx="10" ry="16" fill="none" stroke="#1E2430" strokeWidth="1.5" />

      {/* suspension linework, nose to tyre top — thin pushrod suggestion */}
      <line x1="104" y1="118" x2="68" y2="128" stroke="#252D3A" strokeWidth="2" strokeLinecap="round" />
      <line x1="136" y1="118" x2="172" y2="128" stroke="#252D3A" strokeWidth="2" strokeLinecap="round" />

      {/* sidepod shoulders — angled flare from the cockpit base outward */}
      <path
        d="M 96 132 L 60 116 L 50 108"
        fill="none" stroke="#2A3240" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M 144 132 L 180 116 L 190 108"
        fill="none" stroke="#2A3240" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
      />

      {/* front wing: main plane + endplates */}
      <rect x="18" y="160" width="204" height="12" rx="4" fill="#111419" stroke="#E8001D" strokeWidth="2" />
      <rect x="12" y="150" width="10" height="30" rx="3" fill="#111419" stroke="#E8001D" strokeWidth="2" />
      <rect x="218" y="150" width="10" height="30" rx="3" fill="#111419" stroke="#E8001D" strokeWidth="2" />
      {/* wing undertray accent */}
      <rect x="30" y="171" width="180" height="3" fill="#E8001D" opacity="0.6" />

      {/* nose cone — tapers from the wing up into the cockpit */}
      <path
        d="M 100 162 L 112 92 Q 120 84 128 92 L 140 162 Z"
        fill="#111419" stroke="#8A94A6" strokeWidth="2" strokeLinejoin="round"
      />
      <path d="M 112 150 L 116 100 M 128 150 L 124 100" stroke="#252D3A" strokeWidth="1.5" />

      {/* cockpit opening */}
      <path
        d="M 104 92 Q 120 78 136 92 L 132 108 Q 120 100 108 108 Z"
        fill="#05060A" stroke="#4A5568" strokeWidth="1.5"
      />

      {/* halo — a ring, never a logo, just the structural loop above the
          cockpit; stroke only */}
      <path
        d="M 108 90 Q 108 56 120 50 Q 132 56 132 90"
        fill="none" stroke="#F0F2F5" strokeWidth="4" strokeLinecap="round"
      />
      <line x1="120" y1="50" x2="120" y2="40" stroke="#F0F2F5" strokeWidth="4" strokeLinecap="round" />

      {/* mirrors — small stalks either side of the cockpit */}
      <circle cx="90" cy="98" r="5" fill="#181C23" stroke="#4A5568" strokeWidth="1.5" />
      <circle cx="150" cy="98" r="5" fill="#181C23" stroke="#4A5568" strokeWidth="1.5" />
      <line x1="97" y1="100" x2="104" y2="104" stroke="#4A5568" strokeWidth="1.5" />
      <line x1="143" y1="100" x2="136" y2="104" stroke="#4A5568" strokeWidth="1.5" />
    </svg>
  )
}
