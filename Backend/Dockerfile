# ---------- deps stage: resolve + install into a system site-packages ----------
# uv's official image pairs the uv binary with a matching CPython toolchain.
FROM ghcr.io/astral-sh/uv:python3.10-bookworm-slim AS deps

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

WORKDIR /app

# Dependency files first so this layer stays cached across code changes.
# --system-certs: corporate networks with SSL inspection need the system trust store.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --system-certs

# ---------- runtime stage: minimal, non-root ----------
FROM python:3.10-slim-bookworm AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:${PATH}"

WORKDIR /app

# libpq is required by psycopg binary wheels at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user (numeric UID for distro portability).
RUN groupadd -g 10001 app && useradd -u 10001 -g app -m app

# Bring the resolved virtualenv from the deps stage.
COPY --from=deps /app/.venv /app/.venv

# Application code (Backend/app) + the .env template for reference.
COPY app ./app
COPY .env.example ./.env.example

# Data dir is mounted as a volume (generated at runtime by the init job).
RUN mkdir -p /app/data && chown -R app:app /app

USER app

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8001/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
