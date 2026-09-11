#!/usr/bin/env bash

set -euo pipefail

config_file="/etc/nixos/configuration.nix"

if [[ ${EUID} -ne 0 ]]; then
  echo "Запустите скрипт через sudo: sudo ./scripts/setup-nixos.sh" >&2
  exit 1
fi

if [[ ! -f ${config_file} ]]; then
  echo "Не найден ${config_file}" >&2
  exit 1
fi

temporary_file="$(mktemp)"
backup_file="${config_file}.backup-before-ws-local-$(date +%Y%m%d-%H%M%S)"
changed=false
trap 'rm -f "${temporary_file}"' EXIT

/run/current-system/sw/bin/python3 - "${config_file}" "${temporary_file}" <<'PYTHON'
import re
import sys
from pathlib import Path

source_path = Path(sys.argv[1])
target_path = Path(sys.argv[2])
configuration = source_path.read_text()

hosts_pattern = re.compile(
    r'(?P<prefix>networking\.hosts\s*=\s*\{.*?"127\.0\.0\.1"\s*=\s*\[)'
    r'(?P<names>.*?)'
    r'(?P<suffix>\]\s*;.*?\};)',
    re.DOTALL,
)
hosts_match = hosts_pattern.search(configuration)

if not hosts_match:
    raise SystemExit('Не найден блок networking.hosts для 127.0.0.1')

if '"ws.local"' not in hosts_match.group('names'):
    names = hosts_match.group('names').rstrip() + ' "ws.local" '
    configuration = (
        configuration[:hosts_match.start('names')]
        + names
        + configuration[hosts_match.end('names'):]
    )

virtual_host = '''
  services.nginx.virtualHosts."ws.local".locations."/" = {
    proxyPass = "http://127.0.0.1:8081";
    proxyWebsockets = true;
  };
'''

if 'services.nginx.virtualHosts."ws.local"' not in configuration:
    nginx_pattern = re.compile(r'^\s*services\.nginx\.enable\s*=\s*true\s*;\s*$', re.MULTILINE)
    nginx_match = nginx_pattern.search(configuration)
    if not nginx_match:
        raise SystemExit('Не найдена строка services.nginx.enable = true;')
    configuration = (
        configuration[:nginx_match.end()]
        + '\n'
        + virtual_host
        + configuration[nginx_match.end():]
    )

target_path.write_text(configuration)
PYTHON

if ! cmp -s "${config_file}" "${temporary_file}"; then
  cp --preserve=all "${config_file}" "${backup_file}"
  cp "${temporary_file}" "${config_file}"
  changed=true
  echo "Конфигурация обновлена. Резервная копия: ${backup_file}"
else
  echo "ws.local уже присутствует в конфигурации."
fi

if ! nix-instantiate --parse "${config_file}" >/dev/null; then
  if [[ ${changed} == true ]]; then
    cp --preserve=all "${backup_file}" "${config_file}"
  fi
  echo "Ошибка синтаксиса Nix. Исходная конфигурация восстановлена." >&2
  exit 1
fi

if ! nixos-rebuild switch; then
  if [[ ${changed} == true ]]; then
    cp --preserve=all "${backup_file}" "${config_file}"
  fi
  echo "Сборка не удалась. Исходная конфигурация восстановлена." >&2
  exit 1
fi

echo "Готово: http://ws.local"
