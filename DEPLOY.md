# Развёртывание LeaveFlow на avistrade.anisko.com.by

Это статический React/Vite-прототип. В production Node.js не запускается: Docker собирает `dist/`, а Nginx отдаёт готовые файлы через существующий Traefik. Отдельных портов на хосте контейнер не открывает.

## Требования на сервере

- Ubuntu с работающими Docker и Docker Compose plugin.
- Существующая внешняя Docker-сеть `traefik-proxy`.
- Traefik с entrypoint `websecure` и сертификатным resolver `le`.
- DNS A-запись `avistrade.anisko.com.by → 178.172.225.110`.
- Пользователь `psiu` с доступом к Docker.

Ни конфигурацию Traefik, ни другие контейнеры менять не нужно.

## Первый запуск (один раз)

Подключиться: `ssh psiu@178.172.225.110`.

```bash
docker network inspect traefik-proxy
sudo mkdir -p /srv/avistrade-leave-planner
sudo chown psiu:psiu /srv/avistrade-leave-planner
git clone https://github.com/psiu7217/avistrade-leave-planner.git /srv/avistrade-leave-planner
cd /srv/avistrade-leave-planner
./deploy.sh
```

Проверка:

```bash
docker compose ps leaveflow
docker compose logs --tail=50 leaveflow
curl -I https://avistrade.anisko.com.by/
```

При ошибке `permission denied` от Docker нужно настроить права Docker для своего пользователя или запускать `docker compose` с `sudo`; не менять разрешения docker.sock.

## Обновление после push в main

Из любой SSH-сессии выполнить **одну команду**:

```bash
cd /srv/avistrade-leave-planner && ./deploy.sh
```

Скрипт откажется работать при локальных изменениях tracked-файлов или если выбран не `main`. Затем выполнит `git pull --ff-only`, проверку Compose, пересборку и обновление **только контейнера LeaveFlow**. Другие сервисы на сервере не затрагиваются.

**Для Windows PowerShell (один вызов, без интерактивной сессии):**

```powershell
ssh psiu@178.172.225.110 'cd /srv/avistrade-leave-planner && ./deploy.sh'
```

## Важные особенности прототипа

- Сайт публичный, без авторизации. Переключение HR/сотрудника — демонстрационный режим, не настоящая защита.
- Состояние заявок сохраняется в **localStorage конкретного браузера**. После обновления страницы сохраняется; между устройствами **не синхронизируется**.
- Демо-данные вымышленные; **не вводите реальные персональные данные**.
- По адресу сайта Nginx запрещает прямую отдачу служебных материалов `/assets/aistudio/` и отдаёт `X-Robots-Tag: noindex`.
- Чтобы сбросить демонстрационные заявки, достаточно удалить данные сайта в браузере.
- HTTPS-сертификат выпускает уже настроенный Traefik (`le`); его конфигурация остаётся прежней.
