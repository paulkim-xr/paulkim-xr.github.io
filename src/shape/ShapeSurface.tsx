import type { RefObject } from 'react'
import type { BufferGeometry, MeshBasicMaterial } from 'three'

/** Opacity of each layer at rest, before any morph fade is applied. */
export const FILL_OPACITY = 0.14
export const EDGE_OPACITY = 0.85

type ShapeSurfaceProps = {
  geometry: BufferGeometry
  accent: string
  /**
   * Handles on the two materials, for callers that animate opacity or colour
   * per frame. Driving those through props would re-render the whole subtree
   * sixty times a second to change two numbers.
   */
  fillRef?: RefObject<MeshBasicMaterial | null>
  edgeRef?: RefObject<MeshBasicMaterial | null>
}

/**
 * How every project shape is drawn, in the hub and on the plinth alike.
 *
 * A near-transparent fill plus a wireframe over the same geometry: the fill
 * gives the form volume, the wireframe keeps it legible while the vertices are
 * mid-flight between two shapes and the triangles mean nothing yet. Basic
 * materials only — unlit, so a morphing surface with meaningless normals never
 * flashes as the lighting tries to make sense of it.
 */
export function ShapeSurface({ geometry, accent, fillRef, edgeRef }: ShapeSurfaceProps) {
  return (
    <>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          ref={fillRef}
          color={accent}
          transparent
          opacity={FILL_OPACITY}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          ref={edgeRef}
          color={accent}
          wireframe
          transparent
          opacity={EDGE_OPACITY}
          toneMapped={false}
        />
      </mesh>
    </>
  )
}
