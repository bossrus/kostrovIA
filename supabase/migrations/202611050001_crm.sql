/* Файл создаёт CRM, изоляцию пользователей, закрытые операции и неизменяемый аудит; запускать от postgres. */
begin; /* Применяем схему одной транзакцией. */
create schema if not exists private; /* Прячем вспомогательные функции от PostgREST. */
revoke all on schema private from public; /* Запрещаем общий доступ к приватной схеме. */
grant usage on schema private to authenticated; /* Разрешаем вызовы помощников из RLS. */
create type public.task_status as enum ('new', 'in_progress', 'in_review', 'accepted', 'rework'); /* Фиксируем допустимые статусы. */
create table public.profiles ( /* Храним роли отдельно от изменяемых пользователем метаданных Auth. */
  id uuid primary key references auth.users(id) on delete restrict, /* Связываем профиль с настоящим аккаунтом. */
  display_name text not null check (length(btrim(display_name)) between 1 and 120), /* Сохраняем имя для интерфейса. */
  is_manager boolean not null default false, /* Разрешаем управление собственными объектами. */
  is_executor boolean not null default false, /* Разрешаем назначение задач этому пользователю. */
  check (is_manager or is_executor) /* Не создаём профиль без роли. */
); /* Завершаем таблицу профилей. */
create table public.projects ( /* Стройка всегда принадлежит одному постановщику. */
  id uuid primary key default gen_random_uuid(), /* Генерируем идентификатор в базе. */
  owner_id uuid not null references public.profiles(id), /* Фиксируем владельца. */
  name text not null check (length(btrim(name)) between 1 and 160), /* Ограничиваем название. */
  address text not null check (length(btrim(address)) between 1 and 500), /* Требуем адрес. */
  created_at timestamptz not null default now(), /* Используем серверное время. */
  deleted_at timestamptz /* Сохраняем удалённый объект для связанного аудита. */
); /* Завершаем таблицу объектов. */
create table public.tasks ( /* Задача неизменно связана с объектом и автором. */
  id uuid primary key default gen_random_uuid(), /* Создаём UUID на сервере. */
  project_id uuid not null references public.projects(id) on delete restrict, /* Не допускаем потери связи с объектом. */
  author_id uuid not null references public.profiles(id), /* Запоминаем постановщика. */
  assignee_id uuid not null references public.profiles(id), /* Требуем назначенного исполнителя. */
  title text not null check (length(btrim(title)) between 1 and 200), /* Проверяем название независимо от браузера. */
  description text not null default '' check (length(description) <= 10000), /* Ограничиваем описание. */
  status public.task_status not null default 'new', /* Создаём только новые задачи. */
  created_at timestamptz not null default now(), /* Дату определяет сервер. */
  version integer not null default 1, /* Обнаруживаем одновременные изменения. */
  status_comment text check (length(status_comment) <= 2000), /* Передаём комментарий триггеру истории. */
  deleted_at timestamptz /* Удаление скрывает задачу, сохраняя аудит. */
); /* Завершаем таблицу задач. */
create table public.task_history ( /* Храним только события, созданные триггером. */
  id uuid primary key default gen_random_uuid(), /* Генерируем идентификатор события. */
  task_id uuid not null references public.tasks(id) on delete restrict, /* Запрещаем каскадное уничтожение истории. */
  actor_id uuid not null references public.profiles(id), /* Сохраняем текущего пользователя Auth. */
  actor_name text not null, /* Сохраняем имя на момент действия. */
  from_status public.task_status, /* NULL означает создание задачи. */
  to_status public.task_status not null, /* Фиксируем новое состояние. */
  comment text, /* Сохраняем объяснение возврата. */
  created_at timestamptz not null default clock_timestamp() /* Берём время базы, а не клиента. */
); /* Завершаем таблицу аудита. */
create index projects_owner_idx on public.projects(owner_id); /* Ускоряем поиск собственных объектов. */
create index tasks_project_idx on public.tasks(project_id); /* Ускоряем карточку объекта. */
create index tasks_assignee_idx on public.tasks(assignee_id); /* Ускоряем мои задачи и RLS. */
create index tasks_author_idx on public.tasks(author_id); /* Индексируем внешний ключ автора. */
create index history_task_idx on public.task_history(task_id, created_at); /* Ускоряем хронологию задачи. */
create index history_actor_idx on public.task_history(actor_id); /* Индексируем ссылку на участника. */
create function private.is_manager() returns boolean language sql stable security definer set search_path = '' as $$ /* Читаем защищённую роль. */
  select exists(select 1 from public.profiles where id = auth.uid() and is_manager); /* Не доверяем пользовательским metadata. */
$$; /* Завершаем проверку роли. */
create function private.is_executor() returns boolean language sql stable security definer set search_path = '' as $$ /* Проверяем вторую независимую роль. */
  select exists(select 1 from public.profiles where id = auth.uid() and is_executor); /* Разрешаем совмещение ролей. */
$$; /* Завершаем проверку исполнителя. */
create function private.can_read_task(t public.tasks) returns boolean language sql stable security definer set search_path = '' as $$ /* Изолируем задачи без рекурсии RLS. */
  select t.deleted_at is null and ((private.is_manager() and t.author_id = auth.uid()) or (private.is_executor() and t.assignee_id = auth.uid())); /* Объединяем собственные права двух ролей. */
$$; /* Завершаем проверку задачи. */
create function private.can_read_project(p public.projects) returns boolean language sql stable security definer set search_path = '' as $$ /* Проверяем объект и назначение внутри него. */
  select p.deleted_at is null and ((private.is_manager() and p.owner_id = auth.uid()) or (private.is_executor() and exists(select 1 from public.tasks t where t.project_id = p.id and t.assignee_id = auth.uid() and t.deleted_at is null))); /* Наличие одной задачи не открывает чужие задачи объекта. */
$$; /* Завершаем проверку объекта. */
create function private.can_read_profile(p public.profiles) returns boolean language sql stable security definer set search_path = '' as $$ /* Открываем только необходимый справочник имён. */
  select p.id = auth.uid() or (private.is_manager() and p.is_executor) or exists(select 1 from public.tasks t where private.can_read_task(t) and (t.author_id = p.id or t.assignee_id = p.id)); /* Постановщику нужен список исполнителей для назначения. */
$$; /* Завершаем проверку профиля. */
alter table public.profiles enable row level security; /* Включаем защиту профилей. */
alter table public.projects enable row level security; /* Включаем защиту объектов. */
alter table public.tasks enable row level security; /* Включаем защиту задач. */
alter table public.task_history enable row level security; /* Включаем защиту истории. */
create policy profiles_read on public.profiles for select to authenticated using (private.can_read_profile(profiles)); /* Не даём менять свои роли. */
create policy projects_read on public.projects for select to authenticated using (private.can_read_project(projects)); /* Скрываем чужие стройки. */
create policy tasks_read on public.tasks for select to authenticated using (private.can_read_task(tasks)); /* Скрываем чужие задачи. */
create policy history_read on public.task_history for select to authenticated using (exists(select 1 from public.tasks t where t.id = task_id and private.can_read_task(t))); /* История доступна тем же участникам. */
revoke all on public.profiles, public.projects, public.tasks, public.task_history from anon, authenticated; /* Убираем стандартные права записи Supabase. */
grant select on public.profiles, public.projects, public.tasks, public.task_history to authenticated; /* Через таблицы разрешаем только чтение под RLS. */
create function private.guard_task() returns trigger language plpgsql security definer set search_path = '' as $$ /* Второй рубеж защиты проверяет инварианты при любой записи. */
begin /* Начинаем проверку строки. */
  if auth.uid() is null then raise exception 'Требуется вход' using errcode = '42501'; end if; /* Требуем реального пользователя даже в RPC. */
  if tg_op = 'INSERT' then /* Проверяем создание задачи. */
    if new.status <> 'new' or new.author_id <> auth.uid() or not private.is_manager() then raise exception 'Недопустимое создание задачи' using errcode = '42501'; end if; /* Автор и начальный статус не выбираются клиентом. */
    if not exists(select 1 from public.projects p where p.id = new.project_id and p.owner_id = auth.uid() and p.deleted_at is null) then raise exception 'Объект недоступен' using errcode = '42501'; end if; /* Требуем собственный объект. */
  else /* Проверяем изменение существующей задачи. */
    if old.deleted_at is not null then raise exception 'Задача удалена' using errcode = '42501'; end if; /* Запрещаем восстановление через обходные запросы. */
    if (new.id, new.project_id, new.author_id, new.created_at) is distinct from (old.id, old.project_id, old.author_id, old.created_at) then raise exception 'Нельзя менять объект, автора или дату' using errcode = '42501'; end if; /* Фиксируем принадлежность задачи. */
    if (new.title, new.description, new.assignee_id) is distinct from (old.title, old.description, old.assignee_id) then /* Проверяем редактирование содержимого. */
      if not private.is_manager() or old.author_id <> auth.uid() or old.status <> 'new' then raise exception 'Редактирование возможно только до начала работы' using errcode = '42501'; end if; /* Не допускаем переназначение начатой задачи. */
    end if; /* Завершаем проверку полей. */
    if new.deleted_at is distinct from old.deleted_at and (not private.is_manager() or old.author_id <> auth.uid()) then raise exception 'Удалять может только автор' using errcode = '42501'; end if; /* Проверяем логическое удаление. */
    if new.status is distinct from old.status then /* Проверяем граф переходов на стороне PostgreSQL. */
      if not ((private.is_executor() and old.assignee_id = auth.uid() and ((old.status in ('new', 'rework') and new.status = 'in_progress') or (old.status = 'in_progress' and new.status = 'in_review'))) or (private.is_manager() and old.author_id = auth.uid() and old.status = 'in_review' and new.status in ('accepted', 'rework'))) then raise exception 'Переход статуса запрещён' using errcode = '42501'; end if; /* Других переходов нет даже для автора. */
      if new.status = 'rework' and nullif(btrim(new.status_comment), '') is null then raise exception 'Для возврата нужен комментарий' using errcode = '23514'; end if; /* Требуем осмысленную причину возврата. */
    end if; /* Завершаем проверку статуса. */
    new.version := old.version + 1; /* Обновляем версию только на сервере. */
  end if; /* Завершаем ветвление INSERT/UPDATE. */
  if not exists(select 1 from public.profiles where id = new.assignee_id and is_executor) then raise exception 'У пользователя нет роли исполнителя' using errcode = '23514'; end if; /* Не назначаем задачу постановщику без второй роли. */
  return new; /* Передаём проверенную строку PostgreSQL. */
end; /* Завершаем тело проверки. */
$$; /* Завершаем функцию. */
create trigger tasks_guard before insert or update on public.tasks for each row execute function private.guard_task(); /* Проверяем каждую запись независимо от UI. */
create function private.audit_task() returns trigger language plpgsql security definer set search_path = '' as $$ /* Записываем историю внутри той же транзакции. */
begin /* Начинаем обработку события. */
  if tg_op = 'INSERT' or old.status is distinct from new.status then /* Пишем создание и реальные изменения статуса. */
    insert into public.task_history(task_id, actor_id, actor_name, from_status, to_status, comment) values (new.id, auth.uid(), (select display_name from public.profiles where id = auth.uid()), case when tg_op = 'INSERT' then null else old.status end, new.status, new.status_comment); /* Не принимаем автора или время истории из браузера. */
  end if; /* Игнорируем обычное редактирование полей. */
  return new; /* Возвращаем строку триггеру. */
end; /* Завершаем тело аудита. */
$$; /* Завершаем функцию аудита. */
create trigger tasks_audit after insert or update on public.tasks for each row execute function private.audit_task(); /* Не разрешаем клиенту пропустить аудит. */
create function public.save_project(p_id uuid, p_name text, p_address text) returns uuid language plpgsql security definer set search_path = '' as $$ /* Создаём либо редактируем собственную стройку. */
declare v_id uuid; /* Сохраняем результат операции. */
begin /* Начинаем транзакционную операцию. */
  if not private.is_manager() then raise exception 'Нужна роль постановщика' using errcode = '42501'; end if; /* Не доверяем скрытым кнопкам. */
  if p_id is null then /* Создаём новый объект. */
    insert into public.projects(owner_id, name, address) values (auth.uid(), btrim(p_name), btrim(p_address)) returning id into v_id; /* Владельца определяем по JWT. */
  else /* Обновляем существующий объект. */
    update public.projects set name = btrim(p_name), address = btrim(p_address) where id = p_id and owner_id = auth.uid() and deleted_at is null returning id into v_id; /* WHERE исключает чужие объекты. */
    if v_id is null then raise exception 'Объект недоступен' using errcode = '42501'; end if; /* Не выдаём сведения о чужой записи. */
  end if; /* Завершаем сохранение объекта. */
  return v_id; /* Возвращаем UUID для перехода к карточке. */
end; /* Завершаем тело операции. */
$$; /* Завершаем функцию. */
create function public.delete_project(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$ /* Скрываем собственный пустой объект. */
begin /* Начинаем проверку удаления. */
  perform 1 from public.projects where id = p_id and owner_id = auth.uid() and deleted_at is null for update; /* Блокировка исключает гонку с созданием задачи. */
  if not found or not private.is_manager() then raise exception 'Объект недоступен' using errcode = '42501'; end if; /* Проверяем владельца и роль. */
  if exists(select 1 from public.tasks where project_id = p_id and deleted_at is null) then raise exception 'Сначала удалите задачи объекта' using errcode = '23514'; end if; /* Запрещаем удаление объекта с активными задачами. */
  update public.projects set deleted_at = clock_timestamp() where id = p_id; /* Сохраняем связи с архивными задачами. */
end; /* Завершаем удаление. */
$$; /* Завершаем функцию. */
create function public.save_task(p_id uuid, p_project_id uuid, p_title text, p_description text, p_assignee_id uuid, p_version integer) returns uuid language plpgsql security definer set search_path = '' as $$ /* Сохраняем только собственную новую задачу. */
declare v_task public.tasks; v_id uuid; /* Готовим снимок и результат. */
begin /* Начинаем сохранение. */
  if not private.is_manager() then raise exception 'Нужна роль постановщика' using errcode = '42501'; end if; /* Проверяем роль перед обращением к данным. */
  perform 1 from public.projects where id = p_project_id and owner_id = auth.uid() and deleted_at is null for update; /* Сериализуем создание с удалением объекта. */
  if not found then raise exception 'Объект недоступен' using errcode = '42501'; end if; /* Не разрешаем чужую стройку. */
  if p_id is null then /* Создаём задачу с неизменяемым автором. */
    insert into public.tasks(project_id, author_id, assignee_id, title, description) values (p_project_id, auth.uid(), p_assignee_id, btrim(p_title), p_description) returning id into v_id; /* Статус и время задают defaults. */
  else /* Редактируем с контролем версии. */
    select * into v_task from public.tasks where id = p_id and author_id = auth.uid() and deleted_at is null for update; /* Закрываем гонку с началом работы. */
    if not found then raise exception 'Задача недоступна' using errcode = '42501'; end if; /* Не раскрываем чужую запись. */
    if v_task.project_id <> p_project_id or v_task.status <> 'new' then raise exception 'Редактирование возможно только у новой задачи в её объекте' using errcode = '42501'; end if; /* Не допускаем перенос или правку после старта. */
    if p_version is distinct from v_task.version then raise exception 'Задача изменилась. Обновите страницу' using errcode = 'PT409'; end if; /* Предупреждаем потерю чужого изменения. */
    update public.tasks set title = btrim(p_title), description = p_description, assignee_id = p_assignee_id where id = p_id returning id into v_id; /* Триггер повторно проверяет правила. */
  end if; /* Завершаем создание/редактирование. */
  return v_id; /* Возвращаем идентификатор карточки. */
end; /* Завершаем тело операции. */
$$; /* Завершаем функцию. */
create function public.delete_task(p_id uuid, p_version integer) returns void language plpgsql security definer set search_path = '' as $$ /* Удаляем собственную задачу с сохранением аудита. */
declare v_task public.tasks; /* Готовим заблокированный снимок. */
begin /* Начинаем удаление. */
  select * into v_task from public.tasks where id = p_id and author_id = auth.uid() and deleted_at is null for update; /* Чужие задачи не подходят. */
  if not found or not private.is_manager() then raise exception 'Задача недоступна' using errcode = '42501'; end if; /* Требуем постановщика-владельца. */
  if p_version is distinct from v_task.version then raise exception 'Задача изменилась. Обновите страницу' using errcode = 'PT409'; end if; /* Не удаляем изменённую задачу незаметно. */
  update public.tasks set deleted_at = clock_timestamp() where id = p_id; /* Оставляем историю в базе. */
end; /* Завершаем удаление. */
$$; /* Завершаем функцию. */
create function public.transition_task(p_id uuid, p_to public.task_status, p_comment text, p_version integer) returns void language plpgsql security definer set search_path = '' as $$ /* Единственная публичная точка смены статуса. */
declare v_task public.tasks; /* Готовим текущее состояние. */
begin /* Начинаем смену статуса. */
  select * into v_task from public.tasks t where t.id = p_id and private.can_read_task(t) for update; /* Проверяем видимость до возврата любых ошибок состояния. */
  if not found then raise exception 'Задача недоступна' using errcode = '42501'; end if; /* Закрываем обращение к чужой задаче по UUID. */
  if p_version is distinct from v_task.version then raise exception 'Задача изменилась. Обновите страницу' using errcode = 'PT409'; end if; /* Один снимок нельзя применить дважды. */
  if p_to is null or p_to = v_task.status then raise exception 'Выберите новый статус' using errcode = '23514'; end if; /* Исключаем пустые события истории. */
  update public.tasks set status = p_to, status_comment = nullif(btrim(p_comment), '') where id = p_id; /* Триггер проверяет переход и атомарно записывает историю. */
end; /* Завершаем смену статуса. */
$$; /* Завершаем функцию. */
revoke execute on all functions in schema private from public, anon, authenticated; /* Закрываем триггерные функции и помощники по умолчанию. */
grant execute on function private.is_manager(), private.is_executor(), private.can_read_task(public.tasks), private.can_read_project(public.projects), private.can_read_profile(public.profiles) to authenticated; /* Разрешаем только проверки для RLS. */
revoke execute on function public.save_project(uuid,text,text), public.delete_project(uuid), public.save_task(uuid,uuid,text,text,uuid,integer), public.delete_task(uuid,integer), public.transition_task(uuid,public.task_status,text,integer) from public, anon; /* Запрещаем операции без входа. */
grant execute on function public.save_project(uuid,text,text), public.delete_project(uuid), public.save_task(uuid,uuid,text,text,uuid,integer), public.delete_task(uuid,integer), public.transition_task(uuid,public.task_status,text,integer) to authenticated; /* Каждая разрешённая RPC сама проверяет владельца. */
commit; /* Публикуем только полностью настроенную схему. */
