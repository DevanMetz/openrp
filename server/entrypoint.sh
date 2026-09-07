#!/bin/sh
set -eu
# Railway mounts volumes at runtime as root; give only the data directory to the game user.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown node:node "$DATA_DIR"
  exec gosu node "$@"
fi
exec "$@"
