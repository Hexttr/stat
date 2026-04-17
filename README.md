# Stat

Greenfield-основа для статистического сервиса по региональным медицинским формам.

## Что уже есть

- `apps/web` — Next.js-приложение для админки и будущего пользовательского кабинета.
- `apps/web/prisma/schema.prisma` — первая доменная модель под роли, формы, метрики и импорт архива.
- `docker-compose.yml` — локальный PostgreSQL для разработки.
- `forms` — исходные исторические данные, которые позже пойдут в import-pipeline.

## Быстрый старт

1. Запустить базу:

```bash
docker compose up -d
```

2. Установить зависимости приложения:

```bash
cd apps/web
npm install
```

3. Сгенерировать Prisma client:

```bash
npm run prisma:generate
```

4. Применить первую миграцию:

```bash
npm run prisma:migrate
```

5. Заполнить базовые данные:

```bash
npm run prisma:seed
```

6. Запустить приложение:

```bash
npm run dev
```

## Ближайшие этапы

- Реализовать seed для регионов РФ и стартового суперадмина.
- Добавить авторизацию и RBAC на основе `UserMembership`.
- Сделать CRUD для пользователей, регионов и организаций.
- Собрать конструктор версионируемых форм.
- Вынести импорт `.doc/.docx` в отдельный pipeline с staging-таблицами.

## Подключение к БД

Локальный Postgres этого проекта публикуется на порту `55432`, чтобы не конфликтовать с уже установленными сервисами на `5432/5433`.

## Dev-доступ

После `npm run prisma:seed` создается стартовый суперадмин:

- email: `admin@stat.local`
- password: `Admin12345!`

Эти значения можно переопределить через `ADMIN_EMAIL` и `ADMIN_PASSWORD` в `apps/web/.env`.

## Deploy на сервер

Для боевого стенда используется release-схема в `/opt/stat` с отдельными `shared/env`, `current` и `releases`.

В репозитории есть скрипт `scripts/deploy_release.py`, который:

1. собирает tar.gz из текущего состояния репозитория
2. загружает новый release на сервер
3. привязывает `apps/web/.env` к `/opt/stat/shared/env/web.env`
4. выполняет `npm ci`, `prisma generate`, `prisma db push`, `npm run build`
5. переключает `current` на новый release и перезапускает `stat-web`

Минимальные переменные окружения для запуска:

```bash
export STAT_DEPLOY_HOST=178.170.165.88
export STAT_DEPLOY_USER=user_adm
export STAT_DEPLOY_PASSWORD=your-password
export STAT_DEPLOY_SUDO_PASSWORD=your-password
```

Запуск:

```bash
python scripts/deploy_release.py
```

Если зависимости на сервере уже установлены и нужно просто быстро перевыкатить код:

```bash
python scripts/deploy_release.py --skip-install
```
