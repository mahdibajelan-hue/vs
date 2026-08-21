import DOMPurify from 'dompurify'

/**
 * Strips scripts, event-handler attributes, and other executable content from an uploaded SVG
 * before it's stored or rendered. SVG files are user-supplied (project map uploads, imported
 * project JSON) and get rendered via dangerouslySetInnerHTML across the viewer, schematic tool,
 * and executive report — an unsanitized file is a stored-XSS vector against every collaborator
 * who later opens that project.
 */
export function sanitizeSvg(svgString: string): string {
  return DOMPurify.sanitize(svgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
  })
}
