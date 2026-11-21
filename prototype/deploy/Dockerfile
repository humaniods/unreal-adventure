# The trek server and the game in one image (build from prototype/: docker build -f deploy/Dockerfile .)
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
WORKDIR /app/server
COPY server/pyproject.toml server/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY server/triund_server ./triund_server
COPY walk-test /app/walk-test
ENV TRIUND_STATIC=/app/walk-test TRIUND_DB=/data/triund.db PATH=/app/server/.venv/bin:$PATH
VOLUME /data
EXPOSE 8787
CMD ["uvicorn", "triund_server.app:app", "--host", "0.0.0.0", "--port", "8787", "--proxy-headers", "--forwarded-allow-ips", "*"]
