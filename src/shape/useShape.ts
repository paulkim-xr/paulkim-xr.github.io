import { useEffect, useMemo } from 'react'
import type { BufferGeometry } from 'three'

/**
 * Builds a project's shape once and disposes it on unmount.
 *
 * Shapes are factories rather than shared constants because the hub hands its
 * geometry to WigglyGeometry, which rewrites vertex positions in place — two
 * consumers of one instance would fight over the same buffer.
 */
export function useShape(shape: () => BufferGeometry): BufferGeometry {
  const geometry = useMemo(() => shape(), [shape])

  useEffect(() => () => geometry.dispose(), [geometry])

  return geometry
}
