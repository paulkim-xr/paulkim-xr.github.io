import { useEffect, type ReactNode } from 'react'

/**
 * Reports that a lazy scene has resolved. React suspends the whole subtree
 * until the dynamic import settles, so this component mounting *is* the
 * readiness signal — no promise plumbing required.
 */
export function SceneGate({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  useEffect(() => {
    onReady()
  }, [onReady])

  return <>{children}</>
}
