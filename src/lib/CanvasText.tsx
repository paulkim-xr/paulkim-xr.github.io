import { Text } from '@react-three/drei'
import { Component, Suspense, type ComponentProps, type ReactNode } from 'react'
import { DISPLAY_FONT } from './font'

/**
 * Text in the scene, isolated so that it can never take the scene down with it.
 *
 * drei's Text suspends until troika has fetched and parsed the font file, and
 * R3F's Canvas puts *all* of its children inside one Suspense boundary. Those
 * two facts together mean a single slow or failed request for a 400 kB TTF
 * blanks the entire canvas — no shape, no background, not even the clear
 * colour — while the DOM chrome around it renders as though nothing were
 * wrong. That is a site that looks broken rather than a caption that is
 * missing, and troika never settles its promise on a failed load, so it stays
 * that way for as long as the tab is open.
 *
 * With a boundary of its own, a font that never arrives costs the words and
 * nothing else.
 */
export function CanvasText({ children, ...props }: ComponentProps<typeof Text>) {
  return (
    <FontFailure>
      <Suspense fallback={null}>
        <Text font={DISPLAY_FONT} {...props}>
          {children}
        </Text>
      </Suspense>
    </FontFailure>
  )
}

/**
 * A stalled font load suspends forever and is caught by the Suspense above; a
 * *rejected* one throws on the next render instead, which suspense cannot
 * catch. Both failures have to be contained for the guarantee to hold.
 */
class FontFailure extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
