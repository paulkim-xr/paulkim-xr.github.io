import { Text } from '@react-three/drei'
import { useState } from 'react'
import type { Link } from '../content/schema'
import { DISPLAY_FONT } from '../lib/font'

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

      <Text
        font={DISPLAY_FONT}
        position={[0, 0.5, 0]}
        fontSize={0.16}
        maxWidth={PANEL_WIDTH}
        anchorX="center"
        color="#ffffff"
      >
        {title}
      </Text>

      <Text
        font={DISPLAY_FONT}
        position={[0, 0.32, 0]}
        fontSize={0.075}
        maxWidth={PANEL_WIDTH}
        lineHeight={1.5}
        anchorX="center"
        anchorY="top"
        color="#b9bfcc"
      >
        {blurb}
      </Text>

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
          // noopener is not optional: without it the opened page gets a handle
          // on this window through window.opener.
          window.open(link.href, '_blank', 'noopener,noreferrer')
        }}
      >
        <planeGeometry args={[0.85, 0.18]} />
        <meshBasicMaterial color={hovered ? '#3a5bd9' : '#1e2333'} toneMapped={false} />
      </mesh>
      <Text font={DISPLAY_FONT} position={[0, 0, 0.01]} fontSize={0.065} color="#ffffff">
        {link.label}
      </Text>
    </group>
  )
}
