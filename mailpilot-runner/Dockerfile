FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY requirements.txt pyproject.toml README.md ./
COPY mailpilot ./mailpilot
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir -e .

CMD ["python", "-m", "mailpilot.main", "watch-jobs"]
