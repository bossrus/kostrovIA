// Проверяем облачный Supabase через публичный API и обычные пользовательские сессии.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
const credentials = JSON.parse(await readFile(new URL('../demo-credentials.local', import.meta.url), 'utf8'));
const { mixed: legacyManager, ...accounts } = credentials;
accounts.manager2 ??= legacyManager; // Поддерживаем прежний локальный файл без совмещения ролей.
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
let checks = 0;
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const clients = {};
const ids = {};
for (const role of ['manager', 'manager2', 'executor1', 'executor2']) {
  assert.ok(accounts[role], `Нет доступа ${role} в demo-credentials.local`);
  const c = client();
  const result = await c.auth.signInWithPassword(accounts[role]);
  assert.equal(result.error, null, result.error?.message);
  clients[role] = c;
  ids[role] = result.data.user.id;
}
function ok(value, label) { assert.ok(value, label); ++checks; console.log(`PASS ${label}`); }
async function allowed(promise) { const result = await promise; assert.equal(result.error, null, result.error?.message); return result.data; }
async function denied(promise, label, codes = ['42501', '23514', 'PT409']) {
  const result = await promise;
  ok(result.error && codes.includes(result.error.code), `${label} (${result.error?.code ?? 'запрет отсутствует'})`);
}
const rows = (c, table) => allowed(c.from(table).select('*'));
const call = (c, name, args) => c.rpc(name, args);
const getTask = id => allowed(clients.manager.from('tasks').select('*').eq('id', id).single());
const save = (actor, task, assignee, title = 'Правка постановщика') => call(clients[actor], 'save_task', {
  p_id: task.id, p_project_id: task.project_id, p_title: title, p_description: 'Обновлённое описание', p_assignee_id: ids[assignee], p_version: task.version,
});

// Проверяем состояние схемы до создания записей; старую базу сначала нужно мигрировать.
const profiles = await rows(clients.manager, 'profiles');
ok(profiles.every(p => p.is_manager !== p.is_executor), 'Ровно одна роль у каждого пользователя; иначе примените миграцию 003');
for (const role of Object.keys(clients)) {
  const profile = profiles.find(p => p.id === ids[role]);
  ok(profile && profile.is_manager === role.startsWith('manager') && profile.is_executor === role.startsWith('executor'), `${role}: ожидаемая единственная роль`);
}
const managerProjects = await rows(clients.manager, 'projects');
const secondProjects = await rows(clients.manager2, 'projects');
assert.deepEqual(managerProjects.map(p => p.id).sort(), secondProjects.map(p => p.id).sort());
ok(managerProjects.some(p => p.owner_id === ids.manager2), 'Оба постановщика видят общие объекты');
const managerTasks = await rows(clients.manager, 'tasks');
assert.deepEqual(managerTasks.map(t => t.id).sort(), (await rows(clients.manager2, 'tasks')).map(t => t.id).sort());
ok(managerTasks.some(t => t.author_id === ids.manager2), 'Оба постановщика видят общие задачи');
for (const role of ['executor1', 'executor2']) {
  const tasks = await rows(clients[role], 'tasks');
  const projects = await rows(clients[role], 'projects');
  const history = await rows(clients[role], 'task_history');
  ok(tasks.length > 0 && tasks.every(t => t.assignee_id === ids[role]), `${role}: чужие задачи скрыты`);
  ok(projects.every(p => tasks.some(t => t.project_id === p.id)), `${role}: только объекты с личными задачами`);
  ok(history.every(h => tasks.some(t => t.id === h.task_id)), `${role}: история чужих задач скрыта`);
}
const anon = client();
await denied(anon.from('tasks').select('*'), 'Аноним не читает задачи');
await denied(call(anon, 'save_project', { p_id: null, p_name: 'Обход', p_address: 'Обход' }), 'Аноним не вызывает RPC');
const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
assert.ok(response.ok, 'Auth settings должны быть доступны');
ok((await response.json()).disable_signup === true, 'Открытая регистрация отключена');
await denied(clients.executor1.from('profiles').update({ is_manager: true }).eq('id', ids.executor1), 'Самостоятельное повышение роли закрыто');

const tempProject = await allowed(call(clients.manager, 'save_project', { p_id: null, p_name: 'Проверка безопасности · временный', p_address: 'Тестовые данные' }));
try {
  await allowed(call(clients.manager2, 'save_project', { p_id: tempProject, p_name: 'Правка коллеги', p_address: 'Другой адрес' }));
  const updated = await allowed(clients.manager.from('projects').select('*').eq('id', tempProject).single());
  ok(updated.name === 'Правка коллеги' && updated.owner_id === ids.manager, 'Коллега редактирует объект с сохранением создателя');
  await denied(call(clients.executor1, 'save_project', { p_id: tempProject, p_name: 'Обход', p_address: 'Обход' }), 'Исполнитель не редактирует объект');
  await denied(call(clients.executor1, 'delete_project', { p_id: tempProject }), 'Исполнитель не удаляет объект');
  const createArgs = { p_id: null, p_project_id: tempProject, p_title: 'Тест цикла', p_description: '', p_assignee_id: ids.executor1, p_version: null };
  const tempTask = await allowed(call(clients.manager2, 'save_task', createArgs));
  ok((await getTask(tempTask)).author_id === ids.manager2, 'Коллега создаёт задачу в общем объекте');
  await denied(call(clients.executor1, 'save_task', createArgs), 'Исполнитель не создаёт задачу');
  for (const actor of ['manager', 'manager2']) await denied(call(clients.manager, 'save_task', { ...createArgs, p_assignee_id: ids[actor] }), 'Постановщику нельзя назначить исполнение');
  await denied(call(clients.manager2, 'delete_project', { p_id: tempProject }), 'Непустой объект нельзя удалить');
  await denied(clients.manager.from('tasks').update({ status: 'accepted' }).eq('id', tempTask), 'Прямая смена статуса закрыта');
  await denied(clients.executor1.from('tasks').update({ title: 'Подмена' }).eq('id', tempTask), 'Прямое редактирование исполнителем закрыто');
  await denied(clients.manager.from('tasks').insert({ project_id: tempProject, author_id: ids.manager, assignee_id: ids.executor1, title: 'Обход', status: 'accepted' }), 'Прямой INSERT закрыт');
  await denied(clients.manager.from('tasks').delete().eq('id', tempTask), 'Физическое удаление закрыто');
  await denied(clients.manager.from('task_history').insert({ task_id: tempTask, actor_id: ids.executor1, actor_name: 'Обход', to_status: 'accepted' }), 'Нельзя подделать историю');
  await denied(clients.manager.from('task_history').update({ comment: 'Обход' }).eq('task_id', tempTask), 'Нельзя изменить историю');
  await denied(clients.manager.from('task_history').delete().eq('task_id', tempTask), 'Нельзя удалить историю');
  const states = ['new', 'in_progress', 'in_review', 'accepted', 'rework'];
  const path = [['executor1', 'in_progress'], ['executor1', 'in_review'], ['manager', 'rework'], ['executor1', 'in_progress'], ['executor1', 'in_review'], ['manager2', 'accepted']];
  for (let step = 0; step <= path.length; ++step) {
    let task = await getTask(tempTask);
    for (const actor of Object.keys(clients)) for (const target of states) {
      const permitted = actor === 'executor1' && ((['new', 'rework'].includes(task.status) && target === 'in_progress') || (task.status === 'in_progress' && target === 'in_review')) || actor.startsWith('manager') && task.status === 'in_review' && ['accepted', 'rework'].includes(target);
      if (!permitted) await denied(call(clients[actor], 'transition_task', { p_id: tempTask, p_to: target, p_comment: 'Тест', p_version: task.version }), `${task.status}: ${actor} → ${target} запрещён`);
    }
    for (const actor of ['manager', 'manager2']) {
      const snapshot = task;
      await allowed(save(actor, task, 'executor2'));
      task = await getTask(tempTask);
      ok(task.status === snapshot.status && task.assignee_id === ids.executor2 && task.title === 'Правка постановщика' && task.description === 'Обновлённое описание' && task.author_id === ids.manager2 && task.version === snapshot.version + 1, `${actor} редактирует и переназначает в статусе ${task.status}`);
      await denied(save(actor, snapshot, 'executor1'), 'Устаревшая правка отклонена', ['PT409']);
      await denied(call(clients[actor], 'delete_task', { p_id: tempTask, p_version: snapshot.version }), 'Устаревшее удаление отклонено', ['PT409']);
      await denied(call(clients.executor1, 'transition_task', { p_id: tempTask, p_to: 'in_progress', p_comment: '', p_version: snapshot.version }), 'Прежний исполнитель не действует из старого интерфейса');
      ok(!(await rows(clients.executor1, 'tasks')).some(t => t.id === tempTask) && !(await rows(clients.executor1, 'task_history')).some(h => h.task_id === tempTask), 'Прежнему исполнителю закрыты задача и история');
      ok((await rows(clients.executor2, 'tasks')).some(t => t.id === tempTask), 'Новый исполнитель видит задачу');
      await denied(save('executor2', task, 'executor1'), 'Исполнитель не редактирует и не переназначает');
      await denied(call(clients.executor2, 'delete_task', { p_id: tempTask, p_version: task.version }), 'Исполнитель не удаляет задачу');
      await allowed(save(actor, task, 'executor1'));
      task = await getTask(tempTask);
    }
    if (step < path.length) {
      const [actor, to] = path[step];
      if (to === 'rework') await denied(call(clients[actor], 'transition_task', { p_id: tempTask, p_to: to, p_comment: '   ', p_version: task.version }), 'Возврат требует комментария');
      await allowed(call(clients[actor], 'transition_task', { p_id: tempTask, p_to: to, p_comment: 'Проверено', p_version: task.version }));
      await denied(call(clients[actor], 'transition_task', { p_id: tempTask, p_to: to, p_comment: 'Повтор', p_version: task.version }), 'Устаревший переход отклонён', ['PT409']);
    }
  }
  const history = (await rows(clients.manager, 'task_history')).filter(h => h.task_id === tempTask);
  ok(history.length === 7 && history.every(h => h.actor_id === (['in_progress', 'in_review'].includes(h.to_status) ? ids.executor1 : h.to_status === 'rework' ? ids.manager : ids.manager2)), 'История содержит создание и шесть переходов с настоящими участниками');
  const raceTask = await allowed(call(clients.manager, 'save_task', { ...createArgs, p_title: 'Конкурентный старт' }));
  const raceArgs = { p_id: raceTask, p_to: 'in_progress', p_comment: '', p_version: 1 };
  const race = await Promise.all([call(clients.executor1, 'transition_task', raceArgs), call(clients.executor1, 'transition_task', raceArgs)]);
  ok(race.filter(r => !r.error).length === 1 && race.some(r => r.error?.code === 'PT409'), 'Из конкурентных переходов проходит один');
  const otherProject = managerProjects.find(p => p.id !== tempProject);
  assert.ok(otherProject, 'Нужны demo-объекты');
  await denied(call(clients.manager, 'save_task', { ...createArgs, p_id: tempTask, p_project_id: otherProject.id, p_version: (await getTask(tempTask)).version }), 'Перенос задачи между объектами запрещён');
} finally {
  // Изменяющие проверки затрагивают только выделенный объект; коллега может удалить все его задачи.
  const tasks = await rows(clients.manager2, 'tasks');
  for (const task of tasks.filter(t => t.project_id === tempProject)) await allowed(call(clients.manager2, 'delete_task', { p_id: task.id, p_version: task.version }));
  await allowed(call(clients.manager2, 'delete_project', { p_id: tempProject }));
}
ok(!(await rows(clients.manager, 'projects')).some(p => p.id === tempProject), 'Коллега удаляет объект, запись скрыта');
ok(!(await rows(clients.executor1, 'tasks')).some(t => t.project_id === tempProject), 'Удалённые задачи скрыты у исполнителя');
console.log(`Успешно: ${checks} проверок реального Supabase API.`);
