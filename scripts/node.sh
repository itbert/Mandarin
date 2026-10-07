#!/bin/sh
set -eu
. "$(dirname -- "$0")/env.sh"
exec "$mandarin_runtime/node" "$@"
