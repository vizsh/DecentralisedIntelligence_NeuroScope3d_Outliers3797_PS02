# Backend image: the neuroscope pipeline library + the FastAPI server.
# Model weights and job artefacts live in named volumes (see docker-compose.yml),
# not baked into the image, so they survive a rebuild and don't bloat it.
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8008

# setup_model.py is idempotent (checks for an already-present, sha256-verified
# bundle before downloading anything), so running it on every container start
# is a fast no-op after the first run, not a repeated multi-GB download.
CMD ["sh", "-c", "python setup_model.py && uvicorn server.main:app --host 0.0.0.0 --port 8008"]
