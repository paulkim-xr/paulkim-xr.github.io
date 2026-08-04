import { CirclesScene } from './circles/CirclesScene'
import { GravityScene } from './gravity/GravityScene'
import { LabPage } from './LabPage'

export function CirclesPage() {
  return (
    <LabPage
      title="Circles"
      caption="Every ring is as wide as its distance to the nearest of three Bézier curves, and as coloured as how near it is to each. Drag to look around."
      camera={[0, 0, 21]}
    >
      <CirclesScene />
    </LabPage>
  )
}

export function GravityPage() {
  return (
    <LabPage
      title="Gravity"
      caption="Nine bodies pulling on each other by an inverse square law, sealed in a box. It collapses, and blows itself apart again. Drag to look around, click a sphere to kick it."
      camera={[0, 1.6, 13]}
    >
      <GravityScene />
    </LabPage>
  )
}
