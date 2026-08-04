import { useEffect, useState } from 'react'

type Probe = { label: string; value: string }

export function Capabilities() {
  const [probes, setProbes] = useState<Probe[]>([])

  useEffect(() => {
    const results: Probe[] = [
      { label: 'isSecureContext', value: String(window.isSecureContext) },
      { label: 'location.origin', value: window.location.origin },
      { label: 'navigator.xr present', value: String('xr' in navigator) },
      { label: 'userAgent', value: navigator.userAgent },
    ]

    if (!('xr' in navigator) || !navigator.xr) {
      setProbes([...results, { label: 'immersive-vr', value: 'n/a — no navigator.xr' }])
      return
    }

    navigator.xr
      .isSessionSupported('immersive-vr')
      .then((supported) => setProbes([...results, { label: 'immersive-vr', value: String(supported) }]))
      .catch((error: unknown) =>
        setProbes([...results, { label: 'immersive-vr', value: `threw: ${String(error)}` }]),
      )
  }, [])

  return (
    <div style={{ padding: 24, fontSize: 20, lineHeight: 1.6, fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: 28 }}>M0 spike 1 — capability probe</h1>
      {probes.map((probe) => (
        <div key={probe.label} style={{ wordBreak: 'break-all', marginBottom: 8 }}>
          <strong>{probe.label}:</strong> {probe.value}
        </div>
      ))}
      <p style={{ fontSize: 16, opacity: 0.7 }}>
        Spike 2 (microphone inside a session) is at <a href="/spike/mic">/spike/mic</a>.
      </p>
    </div>
  )
}
