import { z } from 'zod'

export const LinkSchema = z.object({
  label: z.string().min(1),
  /**
   * Either somewhere else entirely, or a route of this site.
   *
   * The lab pieces are projects in their own right and have rooms like any
   * other, but the piece itself is a route here — so its panel has to be able
   * to point inwards. A root-relative path is how it says so.
   */
  href: z.union([z.url(), z.string().regex(/^\/[^/]/)]),
})

export const ProjectSchema = z.object({
  /** Kebab-case; also the URL segment in /p/:id. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: z.string().min(1),
  /** Long enough to inform, short enough to fit one info panel. */
  blurb: z.string().min(20).max(280),
  links: z.array(LinkSchema).min(1),
})

export const ProjectsSchema = z.array(ProjectSchema).min(1)

export type Link = z.infer<typeof LinkSchema>
export type Project = z.infer<typeof ProjectSchema>

export function parseProjects(input: unknown): Project[] {
  return ProjectsSchema.parse(input)
}
