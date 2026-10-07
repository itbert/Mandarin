#!/bin/sh
# Source from node.sh/npm.sh; paths are rooted in this repository.
mandarin_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mandarin_runtime="$mandarin_root/.local-data/toolchain/node/bin"
if [ ! -x "$mandarin_runtime/node" ]; then
  echo 'Local Node runtime is missing. Run ./scripts/setup.sh first.' >&2
  exit 1
fi
export PATH="$mandarin_runtime:$PATH"
export npm_config_cache="$mandarin_root/.local-data/npm-cache"
export npm_config_userconfig="$mandarin_root/.local-data/npm-userconfig"
export ASTRO_TELEMETRY_DISABLED=1
export PLAYWRIGHT_BROWSERS_PATH="$mandarin_root/.local-data/browsers"
export XDG_CACHE_HOME="$mandarin_root/.local-data/cache"
export XDG_CONFIG_HOME="$mandarin_root/.local-data/config"
cd "$mandarin_root"
