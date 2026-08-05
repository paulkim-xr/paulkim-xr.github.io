import { Text } from '@react-three/drei'
import type { ComponentProps } from 'react'
import { Boundary } from './Boundary'
import { DISPLAY_FONT } from './font'

/**
 * Text in the scene, isolated so that it can never take the scene down with it.
 *
 * drei's Text suspends until troika has fetched and parsed the font file, and
 * troika never settles its promise on a failed load. Inside the Canvas's own
 * single Suspense boundary that blanks everything, permanently — see Boundary,
 * which is the general form of the problem. With a boundary of its own, a font
 * that never arrives costs the words and nothing else.
 */
export function CanvasText({ children, ...props }: ComponentProps<typeof Text>) {
  return (
    <Boundary>
      <Text font={DISPLAY_FONT} {...props}>
        {children}
      </Text>
    </Boundary>
  )
}
