const { ZodError } = require('zod');
const { logger } = require('../config/logger');

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed.', details: err.flatten() });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  return res.status(500).json({ error: 'Internal server error.' });
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

module.exports = { ApiError, errorHandler, notFound, asyncHandler };
