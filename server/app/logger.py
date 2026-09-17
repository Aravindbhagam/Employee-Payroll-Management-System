import logging
import os
import sys

from .config import env

logger = logging.getLogger("payrollpro")
_level_name = "CRITICAL" if env.node_env == "test" else os.environ.get("LOG_LEVEL", "info").upper()
logger.setLevel(getattr(logging, _level_name, logging.INFO))

if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    if env.is_production:
        handler.setFormatter(logging.Formatter('{"level":"%(levelname)s","msg":"%(message)s"}'))
    else:
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S"))
    logger.addHandler(handler)
    logger.propagate = False
