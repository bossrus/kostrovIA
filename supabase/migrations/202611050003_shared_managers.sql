/* Общий доступ постановщиков, редактирование во всех статусах и ровно одна роль. */
/* Применять после 001 и 002; авторы, статусы и история сохраняются. */
begin;

create or replace function private.is_manager() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_manager and not is_executor);
$$;

create or replace function private.is_executor() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_executor and not is_manager);
$$;

create or replace function private.can_read_task(t public.tasks) returns boolean language sql stable security definer set search_path = '' as $$
  select t.deleted_at is null and (private.is_manager() or (private.is_executor() and t.assignee_id = auth.uid()));
$$;

create or replace function private.can_read_project(p public.projects) returns boolean language sql stable security definer set search_path = '' as $$
  select p.deleted_at is null and (private.is_manager() or (private.is_executor() and exists(select 1 from public.tasks t where t.project_id = p.id and t.assignee_id = auth.uid() and t.deleted_at is null)));
$$;

create or replace function private.can_read_profile(p public.profiles) returns boolean language sql stable security definer set search_path = '' as $$
  select p.id = auth.uid() or private.is_manager() or exists(select 1 from public.tasks t where private.can_read_task(t) and (t.author_id = p.id or t.assignee_id = p.id));
$$;

create or replace function private.guard_task() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Требуется вход' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'new' or new.author_id <> auth.uid() or not private.is_manager() then raise exception 'Недопустимое создание задачи' using errcode = '42501'; end if;
    if not exists(select 1 from public.projects p where p.id = new.project_id and p.deleted_at is null) then raise exception 'Объект недоступен' using errcode = '42501'; end if;
  else
    if old.deleted_at is not null then raise exception 'Задача удалена' using errcode = '42501'; end if;
    if (new.id, new.project_id, new.author_id, new.created_at) is distinct from (old.id, old.project_id, old.author_id, old.created_at) then raise exception 'Нельзя менять объект, автора или дату' using errcode = '42501'; end if;
    if (new.title, new.description, new.assignee_id) is distinct from (old.title, old.description, old.assignee_id) then
      if not private.is_manager() then raise exception 'Редактировать может только постановщик' using errcode = '42501'; end if;
    end if;
    if new.deleted_at is distinct from old.deleted_at and (not private.is_manager()) then raise exception 'Удалять может только постановщик' using errcode = '42501'; end if;
    if new.status is distinct from old.status then
      if not ((private.is_executor() and old.assignee_id = auth.uid() and ((old.status in ('new', 'rework') and new.status = 'in_progress') or (old.status = 'in_progress' and new.status = 'in_review'))) or (private.is_manager() and old.status = 'in_review' and new.status in ('accepted', 'rework'))) then raise exception 'Переход статуса запрещён' using errcode = '42501'; end if;
      if new.status = 'rework' and nullif(btrim(new.status_comment), '') is null then raise exception 'Для возврата нужен комментарий' using errcode = '23514'; end if;
    end if;
    new.version := old.version + 1;
  end if;
  if not exists(select 1 from public.profiles where id = new.assignee_id and is_executor and not is_manager) then raise exception 'У пользователя нет роли исполнителя' using errcode = '23514'; end if;
  return new;
end;
$$;

create or replace function public.save_project(p_id uuid, p_name text, p_address text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_manager() then raise exception 'Нужна роль постановщика' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.projects(owner_id, name, address) values (auth.uid(), btrim(p_name), btrim(p_address)) returning id into v_id;
  else
    update public.projects set name = btrim(p_name), address = btrim(p_address) where id = p_id and deleted_at is null returning id into v_id;
    if v_id is null then raise exception 'Объект недоступен' using errcode = '42501'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_project(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.projects where id = p_id and deleted_at is null for update;
  if not found or not private.is_manager() then raise exception 'Объект недоступен' using errcode = '42501'; end if;
  if exists(select 1 from public.tasks where project_id = p_id and deleted_at is null) then raise exception 'Сначала удалите задачи объекта' using errcode = '23514'; end if;
  update public.projects set deleted_at = clock_timestamp() where id = p_id;
end;
$$;

create or replace function public.save_task(p_id uuid, p_project_id uuid, p_title text, p_description text, p_assignee_id uuid, p_version integer) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_task public.tasks; v_id uuid;
begin
  if not private.is_manager() then raise exception 'Нужна роль постановщика' using errcode = '42501'; end if;
  perform 1 from public.projects where id = p_project_id and deleted_at is null for update;
  if not found then raise exception 'Объект недоступен' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.tasks(project_id, author_id, assignee_id, title, description) values (p_project_id, auth.uid(), p_assignee_id, btrim(p_title), p_description) returning id into v_id;
  else
    select * into v_task from public.tasks where id = p_id and deleted_at is null for update;
    if not found then raise exception 'Задача недоступна' using errcode = '42501'; end if;
    if v_task.project_id <> p_project_id then raise exception 'Нельзя менять объект задачи' using errcode = '42501'; end if;
    if p_version is distinct from v_task.version then raise exception 'Задача изменилась. Обновите страницу' using errcode = 'PT409'; end if;
    update public.tasks set title = btrim(p_title), description = p_description, assignee_id = p_assignee_id where id = p_id returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_task(p_id uuid, p_version integer) returns void language plpgsql security definer set search_path = '' as $$
declare v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_id and deleted_at is null for update;
  if not found or not private.is_manager() then raise exception 'Задача недоступна' using errcode = '42501'; end if;
  if p_version is distinct from v_task.version then raise exception 'Задача изменилась. Обновите страницу' using errcode = 'PT409'; end if;
  update public.tasks set deleted_at = clock_timestamp() where id = p_id;
end;
$$;

/* Обновляем только известный старый demo-профиль с двумя ролями.
   Дмитрий остаётся постановщиком, его рабочие назначения передаются Ивану.
   Для остальных смешанных профилей требуется явный выбор администратора. */
do $$
declare
  legacy_id uuid;
  manager_id uuid;
  executor_id uuid;
  current_task public.tasks;
  previous_subject text := current_setting('request.jwt.claim.sub', true);
begin
  select p.id into legacy_id from public.profiles p join auth.users u on u.id = p.id
    where u.email = 'mixed@kostrov.demo' and p.is_manager and p.is_executor;
  if legacy_id is not null then
    select p.id into manager_id from public.profiles p join auth.users u on u.id = p.id
      where u.email = 'manager@kostrov.demo' and p.is_manager and not p.is_executor;
    select p.id into executor_id from public.profiles p join auth.users u on u.id = p.id
      where u.email = 'executor1@kostrov.demo' and p.is_executor and not p.is_manager;
    if exists(select 1 from public.tasks where assignee_id = legacy_id and deleted_at is null)
      and (manager_id is null or executor_id is null) then
      raise exception 'Для обновления старой demo нужны manager@kostrov.demo и executor1@kostrov.demo';
    end if;
    update public.profiles set is_executor = false where id = legacy_id;
    perform set_config('request.jwt.claim.sub', manager_id::text, true);
    for current_task in select * from public.tasks where assignee_id = legacy_id and deleted_at is null loop
      perform public.save_task(current_task.id, current_task.project_id, current_task.title,
        current_task.description, executor_id, current_task.version);
    end loop;
    perform set_config('request.jwt.claim.sub', coalesce(previous_subject, ''), true);
  end if;
  if exists(select 1 from public.profiles where is_manager = is_executor) then
    raise exception 'Назначьте каждому профилю ровно одну роль перед миграцией'
      using errcode = '23514', hint = 'Для нестандартных смешанных профилей администратор выбирает роль и переназначает рабочие задачи.';
  end if;
end;
$$;

alter table public.profiles add constraint profiles_exactly_one_role check (is_manager <> is_executor);
comment on column public.projects.owner_id is 'Создатель объекта; управление доступно всем постановщикам';
comment on column public.tasks.author_id is 'Автор задачи; управление доступно всем постановщикам';
/* CREATE OR REPLACE сохраняет ограничения EXECUTE и пустой search_path. */
commit;
