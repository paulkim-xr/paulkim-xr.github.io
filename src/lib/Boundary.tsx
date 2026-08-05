import { Component, Suspense, type ReactNode } from 'react'

/**
 * Isolates one asset-loading subtree so that it can never take the scene down.
 *
 * R3F's Canvas puts *all* of its children inside a single Suspense boundary, so
 * anything that suspends on a network fetch — a font, a model — holds the whole
 * canvas blank until it resolves. When it never resolves, the canvas stays
 * blank for as long as the tab is open: no geometry, no background, not even
 * the clear colour, while the DOM around it renders as though nothing were
 * wrong. That is a site that looks broken rather than one piece that is
 * missing.
 *
 * Both halves are needed. A load that stalls suspends forever and is caught by
 * the Suspense; a load that *rejects* throws on the next render instead, which
 * Suspense cannot catch. Either one alone leaves a way to blank the scene.
 */
export function Boundary({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <CaughtFailure fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </CaughtFailure>
  )
}

class CaughtFailure extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
