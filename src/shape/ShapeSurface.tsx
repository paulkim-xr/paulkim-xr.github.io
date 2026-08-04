import type { BufferGeometry } from 'three'

/**
 * How every project shape is drawn, in the hub and on the plinth alike.
 *
 * A near-transparent fill plus a wireframe over the same geometry: the fill
 * gives the form volume, the wireframe keeps it legible while the vertices are
 * mid-flight between two shapes and the triangles mean nothing yet. Basic
 * materials only — unlit, so a morphing surface with meaningless normals never
 * flashes as the lighting tries to make sense of it.
 */
export function ShapeSurface({ geometry, accent }: { geometry: BufferGeometry; accent: string }) {
  return (
    <>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.14}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={accent}
          wireframe
          transparent
          opacity={0.85}
          toneMapped={false}
        />
      </mesh>
    </>
  )
}
