import type { Project } from './schema'

/**
 * Copy, links and metadata only — no components. The registry in
 * ./registry.tsx binds these values to preview and scene components, so
 * editing a blurb never touches a component file.
 */
export const projects: Project[] = [
  {
    id: 'papercup',
    title: 'papercup',
    blurb:
      'A voice line to Claude Code running on your own homelab. Discord bot: press /pickup, talk like a phone call, get spoken answers. Fully local voice stack — no audio leaves your network.',
    links: [
      { label: 'Repo', href: 'https://github.com/powder-nomad/papercup' },
      { label: 'Docs', href: 'https://powder-nomad.github.io/papercup/' },
    ],
  },
  {
    id: 'skiwatch',
    title: 'SkiWatch',
    blurb:
      'Every Korean ski resort webcam on one page, plus just enough weather to decide whether to go. Anonymous and static by design — no accounts, no server-side user state.',
    links: [{ label: 'Repo', href: 'https://github.com/powder-nomad/SkiWatch' }],
  },
  {
    id: 'open-ski-data',
    title: 'open-ski-data',
    blurb:
      'An open registry of ski resort geometry — places, slopes, lifts, webcams, and the graph connecting them. Contributors edit through a web editor that opens pull requests against the canonical repo.',
    links: [
      { label: 'Repo', href: 'https://github.com/powder-nomad/open-ski-data' },
      { label: 'Editor', href: 'https://osd-edit.pages.dev' },
    ],
  },
  {
    id: 'project-beta',
    title: 'project-beta',
    blurb:
      'Bouldering movement analysis: a video-to-analysis pipeline that measures climbing speed and stability and picks out the crux points of a route.',
    links: [{ label: 'Repo', href: 'https://github.com/powder-nomad/project-beta' }],
  },
  {
    id: 'cli-p2p-boardgame',
    title: 'CLI P2P Board Game Hub',
    blurb:
      'Eleven board games played peer-to-peer entirely in the terminal. UDP beacons find opponents on the LAN with zero configuration, and three clients — Python, Node and Bun — share one wire protocol.',
    links: [{ label: 'Repo', href: 'https://github.com/paulkim-xr/cli-p2p-boardgame' }],
  },
  {
    id: 'circles',
    title: 'Circles',
    blurb:
      'A flat study in distance fields. A grid of rings, each as wide as its distance to the nearest of three Bézier curves and coloured by how near it is to each of them.',
    links: [
      { label: 'Open', href: '/lab/circles' },
      { label: 'Source', href: 'https://github.com/paulkim-xr/paulkim-space' },
    ],
  },
  {
    id: 'gravity',
    title: 'Gravity',
    blurb:
      'Nine bodies pulling on each other by an inverse square law inside a sealed box. It collapses into a heap, then throws itself apart again along a new axis every time.',
    links: [
      { label: 'Open', href: '/lab/gravity' },
      { label: 'Source', href: 'https://github.com/paulkim-xr/paulkim-space' },
    ],
  },
]
