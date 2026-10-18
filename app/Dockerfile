FROM python:3.14-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.11.7 /uv /usr/local/bin/uv

ENV UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy

WORKDIR /workspace
COPY app/pyproject.toml app/uv.lock ./app/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --project app --locked --no-dev

FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/workspace/app/.venv/bin:$PATH"

RUN useradd --create-home --uid 10001 mekascope
WORKDIR /workspace
COPY --from=builder /workspace/app/.venv ./app/.venv
COPY app ./app
# Sample cases load this bundled image from the backend.
COPY web/public/images ./web/public/images

USER mekascope
EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=20 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=2)"

CMD ["sh", "-c", "python -m alembic -c app/alembic.ini upgrade head && exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"]
