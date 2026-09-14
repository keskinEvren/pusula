/**
 * Accept only same-origin application paths for post-auth redirects.
 * Protocol-relative URLs, credentials and backslashes are rejected.
 */
export function getSafeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/'
  }

  return value
}
