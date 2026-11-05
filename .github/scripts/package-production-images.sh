#!/usr/bin/env bash
set -euo pipefail

: "${APP_IMAGE:?APP_IMAGE must identify the application release}"
: "${GITHUB_SHA:?GITHUB_SHA must identify the bundle}"

# Resolve against an empty project directory so neither the local nor server
# .env is read. This also works with older Compose v2 releases.
bundle_config_dir=$(mktemp -d)
trap 'rm -rf "$bundle_config_dir"' EXIT
touch "$bundle_config_dir/.env"
docker compose --project-directory "$bundle_config_dir" --env-file /dev/null \
  -f "$PWD/docker-compose.prod.yml" config --format json > production-compose.json
python3 <<'PY'
import json
import os
from pathlib import Path

services = json.loads(Path("production-compose.json").read_text())["services"]
overrides = {}
rows = []
for service, config in services.items():
    source = config["image"]
    # docker save/load preserves tags, but not repository digests. Pull by the
    # pinned digest first, then transport it under a release-specific local tag.
    target = f"kqa-bundle/{service}:{os.environ['GITHUB_SHA']}" if "@" in source else source
    if target != source:
        overrides[service] = {"image": target}
    rows.append(f"{source}\t{target}\n")
Path("production-image-list.tsv").write_text("".join(rows))
Path("docker-compose.images.json").write_text(json.dumps({"services": overrides}, indent=2) + "\n")
PY

images=()
while IFS=$'\t' read -r source target; do
  # Bound each attempt so a stalled download actually reaches the retry loop.
  for attempt in 1 2 3; do
    if timeout --kill-after=30s 10m docker pull "$source"; then
      break
    fi
    if [ "$attempt" -eq 3 ]; then
      echo "Unable to download $source after 3 attempts." >&2
      exit 1
    fi
    sleep 15
  done
  if [ "$source" != "$target" ]; then
    docker image tag "$source" "$target"
  fi
  images+=("$target")
done < production-image-list.tsv

docker image save "${images[@]}" | gzip -1 > production-images.tar.gz
sha256sum production-images.tar.gz docker-compose.prod.yml docker-compose.images.json > production-images.sha256
rm production-compose.json production-image-list.tsv
