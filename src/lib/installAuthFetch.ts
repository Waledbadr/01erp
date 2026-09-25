/**
 * Attaches the signed-in user's session token to every same-origin `/api/` request
 * that does not already carry an Authorization header.
 *
 * Many screens call fetch('/api/v1/...') without headers. Before this, those requests
 * reached the server unauthenticated and the screens stayed empty (or, for billing,
 * relied on a server-side fallback that has since been removed for security).
 */
const SESSION_KEY = 'saudi_erp_session_token';

export function installAuthFetch(): void {
  if (typeof window === 'undefined' || (window.fetch as { __authWrapped?: boolean }).__authWrapped) return;
  const originalFetch = window.fetch.bind(window);

  const wrapped = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      const target = new URL(url, window.location.origin);
      const token = localStorage.getItem(SESSION_KEY);
      if (token && target.origin === window.location.origin && target.pathname.startsWith('/api/')) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (!headers.has('Authorization') && !headers.has('x-api-key')) {
          headers.set('Authorization', `Bearer ${token}`);
          return originalFetch(input, { ...init, headers });
        }
      }
    } catch {
      // fall through to the unmodified request
    }
    return originalFetch(input, init);
  };
  (wrapped as { __authWrapped?: boolean }).__authWrapped = true;
  window.fetch = wrapped as typeof window.fetch;
}
