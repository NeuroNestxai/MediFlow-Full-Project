export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, d?: unknown) => new AppError(400, 'validation_error', m, d);
export const unauthorized = (m = 'Authentication required') => new AppError(401, 'unauthorized', m);
export const forbidden = (m = 'You do not have permission to do this') => new AppError(403, 'forbidden', m);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (m: string, code = 'conflict') => new AppError(409, code, m);
export const unprocessable = (code: string, m: string, d?: unknown) => new AppError(422, code, m, d);
export const invalidTransition = (from: string, to: string) =>
  new AppError(409, 'invalid_transition', `Cannot move from ${from} to ${to}`, { from, to });
