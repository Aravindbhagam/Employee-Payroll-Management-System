import { ZodError } from 'zod';
import { logger } from '../config/logger.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Express only treats middleware as an error handler when it declares all
// four parameters, so `next` has to stay even though it's unused.
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed.', details: err.flatten() });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  return res.status(500).json({ error: 'Internal server error.' });
}

export function notFound(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
