import { describe, expect, test } from 'vitest'
import { parseProjects, ProjectSchema } from '../../../src/content/schema'
import { projects } from '../../../src/content/projects'

const valid = {
  id: 'papercup',
  title: 'papercup',
  blurb: 'A Discord voice bot that turns your homelab into a phone line you can talk to.',
  links: [{ label: 'Repo', href: 'https://github.com/powder-nomad/papercup' }],
}

describe('ProjectSchema', () => {
  test('accepts a well-formed project', () => {
    expect(ProjectSchema.parse(valid)).toEqual(valid)
  })

  test('rejects an id that is not kebab-case', () => {
    expect(() => ProjectSchema.parse({ ...valid, id: 'Paper Cup' })).toThrow()
  })

  test('rejects a blurb that is too short to be informative', () => {
    expect(() => ProjectSchema.parse({ ...valid, blurb: 'a thing' })).toThrow()
  })

  test('rejects a blurb too long to fit an info panel', () => {
    expect(() => ProjectSchema.parse({ ...valid, blurb: 'x'.repeat(281) })).toThrow()
  })

  test('accepts a link to a route of this site', () => {
    // The lab pieces live at routes here, and their panels point inwards.
    expect(() =>
      ProjectSchema.parse({ ...valid, links: [{ label: 'Open', href: '/lab/circles' }] }),
    ).not.toThrow()
  })

  test('rejects a link href that is neither a URL nor a route', () => {
    expect(() =>
      ProjectSchema.parse({ ...valid, links: [{ label: 'Repo', href: 'lab/circles' }] }),
    ).toThrow()
  })

  test('rejects a protocol-relative href posing as a route', () => {
    // `//evil.example` reads as a path and navigates off-site. It has to fail
    // the route check, or an internal-looking link leaves the origin.
    expect(() =>
      ProjectSchema.parse({ ...valid, links: [{ label: 'Repo', href: '//evil.example/x' }] }),
    ).toThrow()
  })

  test('requires at least one link', () => {
    expect(() => ProjectSchema.parse({ ...valid, links: [] })).toThrow()
  })
})

describe('the real project data', () => {
  test('parses against the schema', () => {
    expect(() => parseProjects(projects)).not.toThrow()
  })

  test('contains the five in-scope projects and the two lab pieces', () => {
    // Was five exactly. The lab pieces now sit on the same footing, by
    // decision: they are what "living XR lab" means and they earn a place in
    // the hub rather than a side door.
    expect(projects.map((p) => p.id).sort()).toEqual(
      [
        'circles',
        'cli-p2p-boardgame',
        'gravity',
        'open-ski-data',
        'papercup',
        'project-beta',
        'skiwatch',
      ].sort(),
    )
  })

  test('has unique ids', () => {
    const ids = projects.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
