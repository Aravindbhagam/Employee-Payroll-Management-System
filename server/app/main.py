from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from .config import env
from .errors import register_error_handlers
from .logger import logger
from .rate_limit import setup_rate_limiting
from .routers import announcements, attendance, audit_logs, auth, dashboard, departments, designations, employees, leave, payroll, payslips, reports, salary, settings, tax, users


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """A minimal equivalent of Express's helmet(): sets the handful of
    security-relevant headers helmet applies by default."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-DNS-Prefetch-Control"] = "off"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers.setdefault("Strict-Transport-Security", "max-age=15552000; includeSubDomains")
        return response


class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if env.node_env != "test":
            logger.info(f'{request.method} {request.url.path} {response.status_code}')
        return response


app = FastAPI(title="PayrollPro API")

register_error_handlers(app)
setup_rate_limiting(app)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=env.client_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


app.include_router(auth.router, prefix="/api/auth")
app.include_router(employees.router, prefix="/api/employees")
app.include_router(departments.router, prefix="/api/departments")
app.include_router(designations.router, prefix="/api/designations")
app.include_router(attendance.router, prefix="/api/attendance")
app.include_router(leave.router, prefix="/api/leave")
app.include_router(salary.router, prefix="/api/salary-structures")
app.include_router(payroll.router, prefix="/api/payroll")
app.include_router(payslips.router, prefix="/api/payslips")
app.include_router(users.router, prefix="/api/users")
app.include_router(audit_logs.router, prefix="/api/audit-logs")
app.include_router(announcements.router, prefix="/api/announcements")
app.include_router(settings.router, prefix="/api/settings")
app.include_router(dashboard.router, prefix="/api/dashboard")
app.include_router(reports.router, prefix="/api/reports")
app.include_router(tax.router, prefix="/api/tax-compliance")


@app.exception_handler(404)
async def not_found(request: Request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=404, content={"error": "Not found."})
