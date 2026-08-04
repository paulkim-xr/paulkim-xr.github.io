/**
 * Self-hosted so troika never reaches for its CDN default. Root-relative
 * because this is a user-scoped Pages site with no base path.
 *
 * Must stay a *static* TTF — troika renders a variable font only at its
 * default instance, so weight variations would silently do nothing.
 */
export const DISPLAY_FONT = '/fonts/display.ttf'
