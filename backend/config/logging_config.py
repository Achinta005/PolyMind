import logging
import sys
import json
from datetime import datetime
import os
from config.settings import settings

# ---------------------------------------------------------------------------
# Colours (dev only)
# ---------------------------------------------------------------------------
_RESET = "\033[0m"
_BOLD = "\033[1m"
_DIM = "\033[2m"
_COLOURS = {
    "DEBUG": "\033[36m",  # cyan
    "INFO": "\033[32m",  # green
    "WARNING": "\033[33m",  # yellow
    "ERROR": "\033[31m",  # red
    "CRITICAL": "\033[41m",  # red background
}


# ---------------------------------------------------------------------------
# Formatters
# ---------------------------------------------------------------------------
class JSONFormatter(logging.Formatter):
    """Structured JSON formatter for production."""

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Attach any extra fields passed via logger.info(..., extra={...})
        skip = {
            "name",
            "msg",
            "args",
            "created",
            "filename",
            "funcName",
            "levelname",
            "levelno",
            "lineno",
            "module",
            "msecs",
            "message",
            "pathname",
            "process",
            "processName",
            "relativeCreated",
            "thread",
            "threadName",
            "exc_info",
            "exc_text",
            "stack_info",
        }
        for key, value in record.__dict__.items():
            if key not in skip:
                log_data[key] = value

        return json.dumps(log_data)


class TextFormatter(logging.Formatter):
    """Coloured, human-readable formatter for local development."""

    def format(self, record: logging.LogRecord) -> str:
        colour = _COLOURS.get(record.levelname, "")
        timestamp = datetime.utcnow().strftime("%H:%M:%S")
        level = f"{colour}{_BOLD}{record.levelname:<8}{_RESET}"
        logger = f"{_DIM}{record.name}{_RESET}"
        msg = record.getMessage()

        line = f"{timestamp} {level} {logger} → {msg}"

        if record.exc_info:
            line += f"\n{self.formatException(record.exc_info)}"

        return line


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
def setup_logging():
    """Configure application logging based on settings.LOG_FORMAT."""

    os.makedirs("logs", exist_ok=True)

    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.LOG_LEVEL))
    root_logger.handlers.clear()

    formatter = JSONFormatter() if settings.LOG_FORMAT == "json" else TextFormatter()

    # Console
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # All logs → file (always JSON for machine-parseable archives)
    file_handler = logging.FileHandler("logs/app.log")
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(JSONFormatter())
    root_logger.addHandler(file_handler)

    # Errors only → separate file
    error_handler = logging.FileHandler("logs/error.log")
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(JSONFormatter())
    root_logger.addHandler(error_handler)

    # Suppress noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    return root_logger


logger = setup_logging()
