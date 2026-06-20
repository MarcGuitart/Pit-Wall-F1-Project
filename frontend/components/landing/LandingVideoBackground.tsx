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
