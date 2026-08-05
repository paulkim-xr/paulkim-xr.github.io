import type { Link } from '../content/schema'
import { CanvasText } from '../lib/CanvasText'
import { LinkButton } from '../lib/LinkButton'

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
