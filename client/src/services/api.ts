/**
 * Base API client — a thin wrapper around fetch that:
 *  - Prepends the base URL (empty string since Vite proxy handles /api)
 *  - Attaches the stored JWT token as an Authorization header
 *  - Parses JSON responses
 *  - Handles 401 responses by clearing the token and redirecting to /login
 */

const TOKEN_KEY = 'slopguesser_token';

/** Retrieve the stored JWT. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Persist a JWT to localStorage. */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Remove the stored JWT. */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Error class for API errors with structured data. */
export class ApiRequestError extends Error {
  status: number;
  code: string;
  details?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    status: number,
    code: string,
    details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Core request function.
 *
 * @param endpoint  The API path, e.g. "/api/auth/login"
 * @param options   Standard RequestInit plus a `skipAuth` flag
 * @returns         The parsed JSON body
 */
export async function request<T>(
  endpoint: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const { skipAuth, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);

  // Attach JSON content type for requests with a body
  if (fetchOptions.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach auth token unless explicitly skipped
  if (!skipAuth) {
    const token = getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(endpoint, {
    ...fetchOptions,
    headers,
  });

  // Handle 401 — auto-logout
  if (response.status === 401) {
    clearToken();
    // Only redirect if we're not already on an auth page
    if (
      !window.location.pathname.startsWith('/login') &&
      !window.location.pathname.startsWith('/register')
    ) {
      window.location.href = '/login';
    }
    throw new ApiRequestError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  // Parse body (may be empty for 204, etc.)
  let body: unknown;
  const contentType = response.headers.get('Content-Type');
  if (contentType && contentType.includes('application/json')) {
    body = await response.json();
  }

  if (!response.ok) {
    const err = body as { error?: { message?: string; code?: string; details?: Array<{ field: string; message: string }> } } | undefined;
    throw new ApiRequestError(
      err?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      err?.error?.code ?? 'UNKNOWN_ERROR',
      err?.error?.details,
    );
  }

  return body as T;
}
