#!/bin/sh
set -eu
mandarin_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mandarin_version=$(tr -d '[:space:]' < "$mandarin_root/.nvmrc")
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) mandarin_platform=darwin-arm64 ;;
  Darwin-x86_64) mandarin_platform=darwin-x64 ;;
  Linux-x86_64) mandarin_platform=linux-x64 ;;
  Linux-aarch64|Linux-arm64) mandarin_platform=linux-arm64 ;;
  *) echo 'Use a supported macOS or Linux platform.' >&2; exit 1 ;;
esac
mandarin_toolchain="$mandarin_root/.local-data/toolchain"
mandarin_archive="node-v${mandarin_version}-${mandarin_platform}.tar.gz"
mkdir -p "$mandarin_toolchain" "$mandarin_root/.local-data/npm-cache" "$mandarin_root/.local-data/browsers"
touch "$mandarin_root/.local-data/npm-userconfig"
if [ ! -x "$mandarin_toolchain/node/bin/node" ] || [ "$("$mandarin_toolchain/node/bin/node" --version)" != "v$mandarin_version" ]; then
  curl -L --fail --show-error "https://nodejs.org/dist/v${mandarin_version}/${mandarin_archive}" -o "$mandarin_toolchain/$mandarin_archive"
  curl -L --fail --show-error "https://nodejs.org/dist/v${mandarin_version}/SHASUMS256.txt" -o "$mandarin_toolchain/SHASUMS256.txt"
  mandarin_expected=$(awk -v file="$mandarin_archive" '$2 == file { print $1 }' "$mandarin_toolchain/SHASUMS256.txt")
  if command -v sha256sum >/dev/null 2>&1; then
    mandarin_actual=$(sha256sum "$mandarin_toolchain/$mandarin_archive" | awk '{print $1}')
  else
    mandarin_actual=$(shasum -a 256 "$mandarin_toolchain/$mandarin_archive" | awk '{print $1}')
  fi
  [ -n "$mandarin_expected" ] && [ "$mandarin_actual" = "$mandarin_expected" ] || { echo 'Node archive checksum does not match.' >&2; exit 1; }
  tar -xzf "$mandarin_toolchain/$mandarin_archive" -C "$mandarin_toolchain"
  if [ -e "$mandarin_toolchain/node" ]; then
    mv "$mandarin_toolchain/node" "$mandarin_toolchain/node-previous-$(date +%s)"
  fi
  mv "$mandarin_toolchain/node-v${mandarin_version}-${mandarin_platform}" "$mandarin_toolchain/node"
fi
"$mandarin_root/scripts/npm.sh" ci
printf '\nMandarin environment ready: %s\n' "$mandarin_root"
"$mandarin_root/scripts/node.sh" --version
