from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .logger import logger


class ApiError(Exception):
    def __init__(self, status_code, message, extra=None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.extra = extra or {}


def register_error_handlers(app):
    @app.exception_handler(ApiError)
    async def _api_error_handler(request: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status_code, content={"error": exc.message, **exc.extra})

    @app.exception_handler(RequestValidationError)
    async def _request_validation_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=400, content={"error": "Validation failed.", "details": exc.errors()})

    @app.exception_handler(ValidationError)
    async def _pydantic_validation_handler(request: Request, exc: ValidationError):
        return JSONResponse(status_code=400, content={"error": "Validation failed.", "details": exc.errors()})

    @app.exception_handler(Exception)
    async def _unhandled_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}")
        return JSONResponse(status_code=500, content={"error": "Internal server error."})
