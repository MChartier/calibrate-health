#!/usr/bin/env bash
set -euo pipefail

prepare_owned_volume() {
  local volume_path
  local marker_path

  volume_path="$1"
  marker_path="${volume_path}/.calibrate-volume-owner-ready"

  mkdir -p "$volume_path"
  if [ -f "$marker_path" ]; then
    return 0
  fi

  sudo chown -R node:node "$volume_path"
  touch "$marker_path"
}

prepare_owned_volume "backend/node_modules"
prepare_owned_volume "frontend/node_modules"
prepare_owned_volume "/home/node/.npm"
