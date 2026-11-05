/* Исполнителю нужно имя создателя видимого объекта, даже если его задачу создал другой постановщик. */
begin;
create or replace function private.can_read_profile(p public.profiles) returns boolean
language sql stable security definer set search_path = '' as $$
  select p.id = auth.uid()
    or private.is_manager()
    or exists(select 1 from public.tasks t
      where private.can_read_task(t) and (t.author_id = p.id or t.assignee_id = p.id))
    or exists(select 1 from public.projects project
      where project.owner_id = p.id and private.can_read_project(project));
$$;
commit;
