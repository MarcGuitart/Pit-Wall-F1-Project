'use client'

export function LandingVideoBackground() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.15 }}
        onError={(e) => ((e.currentTarget as HTMLVideoElement).style.display = 'none')}
      >
        <source src="/video/pitwall-bg.mp4" type="video/mp4" />
      </video>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to bottom, rgba(5,6,10,0.6) 0%, rgba(5,6,10,0.85) 100%)',
        }}
      />
    </div>
  )
}
