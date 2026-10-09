export function loginDestination(location) {
  if (new URLSearchParams(location.search).get('teams_popup') === 'true') return '/teams-auth-success'
  const returnTo = location.state?.returnTo
  // Only accept rooted, same-app paths. Backslashes and control characters
  // can be normalized by browsers into a different destination.
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/')
    || returnTo.startsWith('//') || returnTo.includes('\\')
    || Array.from(returnTo).some((character) => character.charCodeAt(0) <= 32)) return '/'
  return returnTo
}
