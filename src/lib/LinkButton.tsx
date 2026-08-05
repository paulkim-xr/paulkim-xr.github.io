import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Link } from '../content/schema'
import { CanvasText } from './CanvasText'

/**
 * One of a project's links, as something selectable in the scene.
 *
 * Lives out here rather than inside the exhibit panel because a room that is a
 * *place* still has to be able to offer a repo — it just does not want the
 * panel that used to come with it.
 */
export function LinkButton({ link, position }: { link: Link; position: [number, number, number] }) {
  const [hovered, setHovered] = useState(false)
  // Router context reaches in here: R3F renders the canvas into a root of its
  // own, and bridges the surrounding context across.
  const navigate = useNavigate()

  return (
    <group position={position}>
      <mesh
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
        onClick={(event) => {
          event.stopPropagation()
          // A route of this site is a route, not a new tab. Sending it through
          // window.open would open a second copy of the site — and against a
          // local build, an absolute link would have opened production.
          if (link.href.startsWith('/')) {
            void navigate(link.href)
            return
          }
          // noopener is not optional: without it the opened page gets a handle
          // on this window through window.opener.
          window.open(link.href, '_blank', 'noopener,noreferrer')
        }}
      >
        <planeGeometry args={[0.85, 0.18]} />
        <meshBasicMaterial color={hovered ? '#3a5bd9' : '#1e2333'} toneMapped={false} />
      </mesh>
      <CanvasText position={[0, 0, 0.01]} fontSize={0.065} color="#ffffff">
        {link.label}
      </CanvasText>
    </group>
  )
}
