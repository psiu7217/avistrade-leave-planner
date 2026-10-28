#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Ошибка: обновление допускается только из ветки main." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Ошибка: есть локальные изменения в отслеживаемых файлах. Сначала разберись с ними." >&2
  exit 1
fi

echo "==> Получение новых коммитов из origin/main"
git pull --ff-only origin main

echo "==> Проверка конфигурации Docker Compose"
docker compose config --quiet

echo "==> Сборка и обновление только LeaveFlow"
docker compose up -d --build --no-deps leaveflow

echo "==> Состояние контейнера"
docker compose ps leaveflow
echo "Готово: https://avistrade.anisko.com.by/"
