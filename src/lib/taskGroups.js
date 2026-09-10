// Group names currently identify the completed section; task statuses alone do
// not make an active project/group a completed section.
export function isCompletedTaskGroup(group) {
  return /^completed(?:\s+tasks)?$/i.test((group?.name || '').trim())
}
