/**
 * Helpers shared by the HTTP handlers.
 *
 * Keep every helper and constant used by a handler in a module like this one:
 * the Enhanced DX router bundler inlines only the handler function body, so
 * module-level declarations inside router files are not available at runtime.
 */

export const HTTP_BAD_REQUEST = 400;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;
export const HTTP_CONFLICT = 409;

type ErrorResponse = {
  code: number;
  // `never` makes any typed response object assignable here; errors share the channel on purpose.
  json: (object: never) => void;
};

/** Sends `{error, code}` with the given status code, plus any extra fields the client needs to recover. */
export const respondError = (response: ErrorResponse, code: number, error: string, extra: Record<string, unknown> = {}): void => {
  response.code = code;
  response.json({...extra, error, code} as never);
};
