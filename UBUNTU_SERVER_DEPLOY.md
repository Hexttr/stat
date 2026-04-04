# Ubuntu Server Deployment Guide

Инструкция для переноса проекта `stat` на Ubuntu-сервер к презентации. Документ написан так, чтобы другой агент Cursor мог пройти по шагам без дополнительного контекста.

## Цель

Поднять приложение на Ubuntu в следующем виде:

- PostgreSQL запускается через `docker compose`
- Next.js-приложение запускается как `systemd`-сервис
- `nginx` проксирует трафик на приложение
- приложение доступно извне по `http://<server>` или по домену

Это самый практичный и быстрый сценарий для завтрашней демонстрации.

## Важно про Prisma

В этом репозитории схема Prisma ушла вперед относительно папки `prisma/migrations`: часть изменений накатывалась через `db push`.

Поэтому для свежего сервера используйте:

```bash
npx prisma db push
```

а не только `prisma migrate deploy`.

Если выполнить только миграции, часть актуальных таблиц и полей не появится.

## Что должно получиться в конце

- репозиторий лежит в `/opt/stat`
- база работает в Docker
- Next.js работает как сервис `stat-web`
- `nginx` отдает сайт наружу
- логин суперадмина:
  - логин: `admin`
  - пароль: `Admin12345!`

## 1. Требования к серверу

- Ubuntu 22.04 LTS или 24.04 LTS
- пользователь с `sudo`
- открыты порты `22`, `80`, при необходимости `443`
- минимум 2 GB RAM, лучше 4 GB

## 2. Установка системных пакетов

```bash
sudo apt update
sudo apt install -y git curl build-essential nginx ca-certificates gnupg
```

## 3. Установка Node.js

Рекомендуется Node.js 22 LTS.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node -v
npm -v
```

## 4. Установка Docker и Docker Compose plugin

```bash
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

После этого лучше перелогиниться в SSH-сессию или выполнить:

```bash
newgrp docker
```

## 5. Клонирование проекта

```bash
sudo mkdir -p /opt
sudo chown $USER:$USER /opt
cd /opt
git clone https://github.com/Hexttr/stat.git
cd /opt/stat
```

## 6. Подготовка переменных окружения

Создайте файл:

`/opt/stat/apps/web/.env`

Минимально необходимое содержимое:

```env
DATABASE_URL="postgresql://stat:stat@localhost:55432/stat?schema=public"
AUTH_SECRET="replace-with-a-long-random-random-string"
NEXTAUTH_URL="http://SERVER_IP_OR_DOMAIN"
ADMIN_EMAIL="admin@stat.local"
ADMIN_PASSWORD="Admin12345!"
```

Генерация надежного `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Если архивный handoff PostgreSQL для презентации не нужен, `HANDOFF_DATABASE_URL` можно пока не задавать.

Если нужен и уже восстановлен отдельно:

```env
HANDOFF_DATABASE_URL="postgresql://..."
```

## 7. Поднять PostgreSQL

В корне репозитория уже есть `docker-compose.yml`.

```bash
cd /opt/stat
docker compose up -d
docker compose ps
```

Проверка, что база поднялась:

```bash
docker compose logs postgres --tail=50
```

По умолчанию проект использует:

- БД: `stat`
- пользователь: `stat`
- пароль: `stat`
- внешний порт: `55432`

## 8. Установить зависимости приложения

```bash
cd /opt/stat/apps/web
npm ci
```

## 9. Инициализация Prisma и базы

```bash
cd /opt/stat/apps/web
npm run prisma:generate
npx prisma db push
npm run prisma:seed
```

Если команда `db push` спросит про потенциальную потерю данных на чистом сервере, можно безопасно использовать:

```bash
npx prisma db push --accept-data-loss
```

Для нового пустого сервера это допустимо.

## 10. Production build

```bash
cd /opt/stat/apps/web
npm run build
```

## 11. Создать systemd-сервис

Создайте файл:

`/etc/systemd/system/stat-web.service`

Содержимое:

```ini
[Unit]
Description=Stat Next.js app
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/stat/apps/web
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```

Применить:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now stat-web
sudo systemctl status stat-web
```

Если хочешь запускать не от `root`, создай отдельного пользователя, например `stat`, и выдай ему права на `/opt/stat`.

## 12. Настройка nginx

Создайте файл:

`/etc/nginx/sites-available/stat`

Содержимое:

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Активировать:

```bash
sudo ln -sf /etc/nginx/sites-available/stat /etc/nginx/sites-enabled/stat
sudo nginx -t
sudo systemctl restart nginx
```

## 13. Базовая проверка

Проверка локально на сервере:

```bash
curl -I http://127.0.0.1:3000/login
curl -I http://127.0.0.1
```

Проверка сервисов:

```bash
sudo systemctl status stat-web
sudo systemctl status nginx
docker compose ps
```

## 14. Доступ для презентации

После `seed` должен работать вход:

- логин: `admin`
- пароль: `Admin12345!`

Важно: в текущей версии логин выполняется по `loginCode`, а не по email.

## 15. Полезные команды поддержки

Перезапуск приложения:

```bash
sudo systemctl restart stat-web
```

Просмотр логов приложения:

```bash
sudo journalctl -u stat-web -n 200 --no-pager
sudo journalctl -u stat-web -f
```

Пересборка после `git pull`:

```bash
cd /opt/stat
git pull
cd /opt/stat/apps/web
npm ci
npm run prisma:generate
npx prisma db push
npm run build
sudo systemctl restart stat-web
```

Перезапуск базы:

```bash
cd /opt/stat
docker compose restart postgres
```

## 16. Если есть домен и нужен HTTPS

После того как сайт открывается по `http`, можно быстро включить HTTPS через Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

И не забудь поменять в `.env`:

```env
NEXTAUTH_URL="https://your-domain.example"
```

После этого:

```bash
cd /opt/stat/apps/web
npm run build
sudo systemctl restart stat-web
```

## 17. Частые проблемы

### Приложение не стартует

Смотри:

```bash
sudo journalctl -u stat-web -n 200 --no-pager
```

Чаще всего причина одна из этих:

- не задан `DATABASE_URL`
- не задан `AUTH_SECRET`
- не был выполнен `npx prisma db push`
- не был выполнен `npm run build`

### Не работает вход

Проверь:

- логин вводится как `admin`, а не как `admin@stat.local`
- в `.env` не переопределен `ADMIN_PASSWORD`
- база была действительно засидирована через `npm run prisma:seed`

### Ошибки Prisma после запуска

Обычно это значит, что схема БД не синхронизирована с `schema.prisma`.

Исправление:

```bash
cd /opt/stat/apps/web
npx prisma db push
sudo systemctl restart stat-web
```

## 18. Краткое ТЗ для другого агента Cursor

Если эту задачу будет выполнять другой агент, его цель должна звучать так:

1. Поднять проект `stat` на Ubuntu-сервере.
2. Использовать PostgreSQL из `docker-compose.yml`.
3. Развернуть `apps/web` как production Next.js-приложение.
4. Использовать `npx prisma db push`, а не полагаться только на миграции.
5. Настроить `systemd` для автозапуска приложения.
6. Настроить `nginx` как reverse proxy.
7. Проверить, что `/login` открывается и вход под `admin / Admin12345!` работает.

## 19. Короткий чеклист готовности

- `docker compose ps` показывает живой Postgres
- `systemctl status stat-web` показывает active
- `systemctl status nginx` показывает active
- `http://SERVER_IP/login` открывается
- логин `admin` работает
- админка открывается

