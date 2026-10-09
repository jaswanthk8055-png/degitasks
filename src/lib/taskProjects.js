// Active and completed sections can hold separate rows for the same project.
export function normalizeProjectName(name) {
  return (name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}
