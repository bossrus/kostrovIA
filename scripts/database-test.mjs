// Проверяем настоящие SQL-функции, триггеры, grants и RLS в изолированном PostgreSQL (WASM).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { actions } from '../src/domain.ts';

const db = new PGlite();
const ids = Object.fromEntries(['manager', 'executor1', 'executor2', 'manager2'].map((role, index) => [role, `00000000-0000-0000-0000-00000000000${index + 1}`]));
const migrations = ['202611050001_crm.sql', '202611050002_conflict_response.sql', '202611050003_shared_managers.sql', '202611050004_project_owner_names.sql'];
const bootstrap = `create role anon; create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key, email text unique);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;`;
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); ++checks; };
async function migrate(name) { await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')); }
async function as(role, sql, params = []) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ids[role] ?? '']);
  await db.exec(`set role ${role === 'anon' ? 'anon' : 'authenticated'}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
}
async function denied(promise, label, codes = ['42501', '23514', 'PT409']) {
  await assert.rejects(promise, error => codes.includes(error.code), label);
  ++checks;
}
const project = async (actor) => (await as(actor, "select public.save_project(null, 'Тестовый объект', 'Адрес') as id"))[0].id;
const create = async (actor, projectId, assignee = 'executor1') => (await as(actor, "select public.save_task(null, $1, 'Задача', 'Описание', $2, null) as id", [projectId, ids[assignee]]))[0].id;
const task = async id => (await as('manager', 'select * from public.tasks where id = $1', [id]))[0];
const move = async (actor, id, to, comment = '') => as(actor, 'select public.transition_task($1, $2, $3, $4)', [id, to, comment, (await as(actor, 'select version from public.tasks where id = $1', [id]))[0].version]);
const save = (actor, current, assignee, title = 'Обновлено') => as(actor, 'select public.save_task($1, $2, $3, $4, $5, $6)', [current.id, current.project_id, title, 'Новое описание', ids[assignee], current.version]);

try {
  // Моделируем только Supabase Auth; вся прикладная SQL-схема читается из миграций без изменений.
  await db.exec(bootstrap);
  await migrate(migrations[0]);
  await migrate(migrations[1]);
  for (const [role, id] of Object.entries(ids)) {
    await db.query('insert into auth.users values ($1, $2)', [id, `${role === 'manager2' ? 'mixed' : role}@kostrov.demo`]);
    await db.query('insert into public.profiles values ($1, $2, $3, $4)', [id, role, role.startsWith('manager'), !role.startsWith('manager') || role === 'manager2']);
  }
  const p1 = await project('manager');
  const p2 = await project('manager2');
  const legacyNew = await create('manager', p1, 'manager2');
  const legacyAccepted = await create('manager2', p2, 'manager2');
  await move('manager2', legacyAccepted, 'in_progress');
  await move('manager2', legacyAccepted, 'in_review');
  await move('manager2', legacyAccepted, 'accepted');
  const before = (await as('manager2', 'select * from public.tasks where id = $1', [legacyAccepted]))[0];
  const oldHistory = await as('manager2', 'select * from public.task_history where task_id = $1 order by created_at', [legacyAccepted]);
  const customId = '00000000-0000-0000-0000-000000000099';
  await db.query("insert into auth.users values ($1, 'custom@example.test')", [customId]);
  await db.query("insert into public.profiles values ($1, 'Нестандартный профиль', true, true)", [customId]);
  await denied(migrate(migrations[2]), 'Нестандартную смешанную роль миграция не выбирает автоматически', ['23514']);
  await db.exec('rollback');
  ok((await as('manager2', 'select assignee_id from public.tasks where id = $1', [legacyAccepted]))[0].assignee_id === ids.manager2, 'Неудачная миграция полностью откатывает demo-переназначения');
  await db.query('delete from public.profiles where id = $1', [customId]);
  await db.query('delete from auth.users where id = $1', [customId]);
  await migrate(migrations[2]);
  await migrate(migrations[3]);
  const after = await task(legacyAccepted);
  ok(after.status === 'accepted' && after.author_id === before.author_id && after.project_id === before.project_id && after.created_at.getTime() === before.created_at.getTime(), 'Миграция сохраняет статус, автора, объект и дату');
  ok(after.assignee_id === ids.executor1 && after.version === before.version + 1 && (await task(legacyNew)).assignee_id === ids.executor1, 'Старые demo-назначения переданы исполнителю');
  assert.deepEqual(await as('manager2', 'select * from public.task_history where task_id = $1 order by created_at', [legacyAccepted]), oldHistory);
  ++checks;
  const profiles = await as('manager', 'select * from public.profiles');
  ok(profiles.every(p => p.is_manager !== p.is_executor), 'Все роли взаимоисключающие');
  await denied(db.query('update public.profiles set is_executor = true where id = $1', [ids.manager]), 'База запрещает две роли');
  await denied(db.query('update public.profiles set is_manager = false where id = $1', [ids.manager]), 'База запрещает отсутствие роли');
  assert.deepEqual(await as('manager', 'select * from public.projects order by id'), await as('manager2', 'select * from public.projects order by id'));
  ++checks;
  await as('manager2', "select public.save_project($1, 'Изменён коллегой', 'Новый адрес')", [p1]);
  ok((await as('manager', 'select * from public.projects where id = $1', [p1]))[0].owner_id === ids.manager, 'Коллега редактирует объект, создатель сохраняется');
  const cycle = await create('manager2', p1);
  ok((await task(cycle)).author_id === ids.manager2, 'Постановщик создаёт задачу в объекте коллеги');
  const states = ['new', 'in_progress', 'in_review', 'rework', 'accepted'];
  const path = [['executor1', 'in_progress'], ['executor1', 'in_review'], ['manager2', 'rework'], ['executor1', 'in_progress'], ['executor1', 'in_review'], ['manager', 'accepted']];
  for (let step = 0; step <= path.length; ++step) {
    let current = await task(cycle);
    for (const actor of ['manager', 'manager2', 'executor1', 'executor2']) {
      const me = profiles.find(p => p.id === ids[actor]);
      const expected = actor === 'executor1' ? ['new', 'rework'].includes(current.status) ? ['in_progress'] : current.status === 'in_progress' ? ['in_review'] : [] : actor.startsWith('manager') && current.status === 'in_review' ? ['accepted', 'rework'] : [];
      assert.deepEqual(actions(current, me).map(action => action.to).sort(), expected.sort());
      ++checks;
      for (const target of states.filter(target => !expected.includes(target))) {
        await denied(as(actor, 'select public.transition_task($1, $2, $3, $4)', [cycle, target, 'Тест', current.version]), `${current.status}: ${actor} → ${target}`);
      }
    }
    // Правка и переназначение обоими постановщиками во всех пяти статусах.
    for (const actor of ['manager', 'manager2']) {
      const snapshot = current;
      await save(actor, current, 'executor2');
      current = await task(cycle);
      ok(current.status === snapshot.status && current.author_id === ids.manager2 && current.title === 'Обновлено' && current.description === 'Новое описание' && current.assignee_id === ids.executor2 && current.version === snapshot.version + 1, `${actor} редактирует ${snapshot.status} без смены статуса`);
      await denied(save(actor, snapshot, 'executor1'), 'Устаревшее редактирование отклонено', ['PT409']);
      await denied(as(actor, 'select public.delete_task($1, $2)', [cycle, snapshot.version]), 'Устаревшее удаление отклонено', ['PT409']);
      await denied(as('executor1', 'select public.transition_task($1, $2, $3, $4)', [cycle, 'in_progress', '', snapshot.version]), 'Прежний исполнитель не действует из старого интерфейса');
      ok(!(await as('executor1', 'select id from public.tasks where id = $1', [cycle])).length && !(await as('executor1', 'select id from public.task_history where task_id = $1', [cycle])).length, 'Прежнему исполнителю закрыты задача и история');
      ok((await as('executor2', 'select id from public.tasks where id = $1', [cycle])).length === 1, 'Новый исполнитель видит задачу');
      ok((await as('executor2', 'select display_name from public.profiles where id = $1', [ids.manager])).length === 1, 'Исполнитель видит имя владельца объекта, даже если задачу создал коллега');
      await denied(save('executor2', current, 'executor1'), 'Назначенный исполнитель не редактирует и не переназначает');
      await denied(as('executor2', 'select public.delete_task($1, $2)', [cycle, current.version]), 'Исполнитель не удаляет');
      await save(actor, current, 'executor1');
      current = await task(cycle);
    }
    if (step < path.length) {
      const [actor, to] = path[step];
      if (to === 'rework') await denied(move(actor, cycle, to, '   '), 'Возврат требует комментария');
      await move(actor, cycle, to, 'Проверено');
    }
  }
  const history = await as('manager', 'select * from public.task_history where task_id = $1 order by created_at', [cycle]);
  ok(history.length === 7 && history[3].actor_id === ids.manager2 && history[6].actor_id === ids.manager, 'История содержит только создание и шесть переходов с настоящими участниками');
  for (const role of ['executor1', 'executor2']) {
    const visibleTasks = await as(role, 'select * from public.tasks');
    ok(visibleTasks.every(t => t.assignee_id === ids[role]), 'RLS оставляет исполнителю только его задачи');
    ok((await as(role, 'select * from public.projects')).every(p => visibleTasks.some(t => t.project_id === p.id)), 'RLS оставляет только объекты с назначениями');
    await denied(as(role, "select public.save_project($1, 'Подмена', 'Адрес')", [p1]), 'Исполнитель не редактирует объект');
    await denied(as(role, 'select public.delete_project($1)', [p1]), 'Исполнитель не удаляет объект');
    await denied(create(role, p1), 'Исполнитель не создаёт задачи');
  }
  await denied(create('manager', p1, 'manager2'), 'Нельзя назначить постановщика');
  await denied(as('manager', 'select public.delete_project($1)', [p1]), 'Нельзя удалить непустой объект');
  const current = await task(cycle);
  await denied(as('manager', 'select public.save_task($1, $2, $3, $4, $5, $6)', [cycle, p2, 'Перенос', '', ids.executor1, current.version]), 'Объект задачи неизменяем');
  for (const role of ['anon', 'executor1', 'manager']) {
    await denied(as(role, "update public.tasks set title = 'Обход' where id = $1", [cycle]), 'Прямой UPDATE закрыт');
    await denied(as(role, 'delete from public.tasks where id = $1', [cycle]), 'Прямой DELETE закрыт');
    await denied(as(role, "insert into public.tasks(project_id, author_id, assignee_id, title) values ($1, $2, $3, 'Обход')", [p1, ids.manager, ids.executor1]), 'Прямой INSERT закрыт');
    await denied(as(role, 'update public.profiles set is_manager = true where id = $1', [ids.executor1]), 'Самостоятельная смена роли закрыта');
    await denied(as(role, "insert into public.task_history(task_id, actor_id, actor_name, to_status) values ($1, $2, 'Подмена', 'accepted')", [cycle, ids.manager]), 'Подделка истории закрыта');
  }
  await denied(as('anon', 'select * from public.tasks'), 'Аноним не читает задачи');
  await denied(project('anon'), 'Аноним не вызывает RPC');
  await as('manager', 'select public.delete_task($1, $2)', [cycle, current.version]);
  ok(!(await as('manager2', 'select * from public.tasks where id = $1', [cycle])).length, 'Коллега удаляет принятую задачу');
  ok(!(await as('executor1', 'select * from public.task_history where task_id = $1', [cycle])).length, 'История удалённой задачи скрыта');
  ok((await db.query('select * from public.task_history where task_id = $1', [cycle])).rows.length === 7, 'Удаление сохраняет аудит в базе');
  const empty = await project('manager');
  await as('manager2', 'select public.delete_project($1)', [empty]);
  ok(!(await as('manager', 'select * from public.projects where id = $1', [empty])).length, 'Коллега удаляет пустой объект');
  const fresh = new PGlite();
  try {
    await fresh.exec(bootstrap);
    for (const name of migrations) await fresh.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    for (const [role, id] of Object.entries(ids)) await fresh.query('insert into auth.users values ($1, $2)', [id, `${role === 'manager2' ? 'mixed' : role}@kostrov.demo`]);
    await fresh.exec(await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8'));
    const seeded = (await fresh.query('select * from public.profiles')).rows;
    ok(seeded.length === 4 && seeded.every(p => p.is_manager !== p.is_executor) && seeded.filter(p => p.is_manager).length === 2, 'Чистая установка с seed создаёт двух постановщиков и двух исполнителей');
  } finally { await fresh.close(); }
  console.log(`Успешно: ${checks} локальных проверок PostgreSQL, RLS, миграции и кнопок интерфейса.`);
} finally {
  await db.close();
}
