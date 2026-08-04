import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Link } from '../content/schema'
import { CanvasText } from '../lib/CanvasText'

const PANEL_WIDTH = 2.4

export function InfoPanel({
  title,
  blurb,
  links,
}: {
  title: string
  blurb: string
  links: Link[]
}) {
  return (
    <group>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[PANEL_WIDTH + 0.3, 1.5]} />
        <meshBasicMaterial color="#101017" toneMapped={false} />
      </mesh>

      <CanvasText
        position={[0, 0.5, 0]}
        fontSize={0.16}
        maxWidth={PANEL_WIDTH}
        anchorX="center"
        color="#ffffff"
      >
        {title}
      </CanvasText>

      <CanvasText
        position={[0, 0.32, 0]}
        fontSize={0.075}
        maxWidth={PANEL_WIDTH}
        lineHeight={1.5}
        anchorX="center"
        anchorY="top"
        color="#b9bfcc"
      >
        {blurb}
      </CanvasText>

      <group position={[0, -0.52, 0]}>
        {links.map((link, index) => (
          <LinkButton
            key={link.href}
            link={link}
            position={[(index - (links.length - 1) / 2) * 0.95, 0, 0]}
          />
        ))}
      </group>
    </group>
  )
}

function LinkButton({ link, position }: { link: Link; position: [number, number, number] }) {
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
