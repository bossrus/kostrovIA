// Файл проверяет реальную облачную базу через публичный API: изоляцию, запреты записи, граф статусов и гонки.
import assert from 'node:assert/strict'; // Останавливаем проверку при нарушении ожиданий.
import { readFile } from 'node:fs/promises'; // Читаем только локальные тестовые доступы.
import { createClient } from '@supabase/supabase-js'; // Отправляем те же запросы, что способен отправить браузер.
const credentials = JSON.parse(await readFile(new URL('../demo-credentials.local', import.meta.url), 'utf8')); // Файл исключён из Git.
const url = process.env.VITE_SUPABASE_URL; const key = process.env.VITE_SUPABASE_ANON_KEY; let checks = 0; // Не используем административные секреты.
function client() { return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); } // Изолируем сессии разных пользователей.
const clients = {}; const ids = {}; // Готовим аккаунты и их UUID.
for (const [role, account] of Object.entries(credentials)) { const c = client(); const result = await c.auth.signInWithPassword(account); assert.equal(result.error, null); clients[role] = c; ids[role] = result.data.user.id; } // Требуем успешный вход всех четырёх аккаунтов.
function ok(value, message) { assert.ok(value, message); ++checks; console.log(`PASS ${message}`); } // Печатаем только названия проверок.
async function allowed(promise) { const result = await promise; assert.equal(result.error, null, result.error?.message); return result.data; } // Не игнорируем неожиданные ошибки.
async function denied(promise, label, codes = ['42501', '23514', 'PT409']) { const result = await promise; ok(result.error && codes.includes(result.error.code), `${label} (${result.error?.code ?? 'запрет отсутствует'})`); } // Сетевой сбой не считается доказательством запрета.
const rows = (c, table) => allowed(c.from(table).select('*')); // Читаем полные доступные выборки под RLS.
const call = (c, name, args) => c.rpc(name, args); // Оставляем возможность отдельно проверять отрицательные ответы.
const managerProjects = await rows(clients.manager, 'projects'); const mixedProjects = await rows(clients.mixed, 'projects'); // Сравниваем доступ двух постановщиков.
const ownProject = managerProjects.find(p => p.owner_id === ids.manager); const foreignProject = mixedProjects.find(p => p.owner_id === ids.mixed); // Находим изолированные объекты из demo.
assert.ok(ownProject && foreignProject, 'Сначала запустите demo-seed'); // Требуем известные тестовые данные.
ok(!managerProjects.some(p => p.id === foreignProject.id), 'Постановщик не видит чужой объект'); // Проверяем уточнённое требование пользователя.
const managersTasks = await rows(clients.manager, 'tasks'); const mixedTasks = await rows(clients.mixed, 'tasks'); // Проверяем совмещение ролей.
ok(managersTasks.every(t => t.author_id === ids.manager), 'Постановщик видит только задачи своих объектов'); // Не допускаем глобального доступа по роли.
ok(mixedTasks.some(t => t.author_id === ids.manager && t.assignee_id === ids.mixed) && mixedTasks.some(t => t.author_id === ids.mixed), 'Смешанная роль видит свои объекты и личные назначения'); // Проверяем объединение двух ролей.
for (const role of ['executor1', 'executor2']) { // Проверяем обоих исполнителей отдельно.
  const tasks = await rows(clients[role], 'tasks'); const projects = await rows(clients[role], 'projects'); const history = await rows(clients[role], 'task_history'); // Запрашиваем все записи без клиентских фильтров.
  ok(tasks.length > 0 && tasks.every(t => t.assignee_id === ids[role]), `${role}: чужие задачи скрыты`); // RLS ограничивает именно строки базы.
  ok(projects.every(p => tasks.some(t => t.project_id === p.id)), `${role}: видны только объекты с личными задачами`); // Не открываем остальные стройки.
  ok(history.every(h => tasks.some(t => t.id === h.task_id)), `${role}: история чужих задач скрыта`); // Проверяем аудит отдельно от задач.
} // Завершаем чтение исполнителей.
const anon = client(); await denied(anon.from('tasks').select('*'), 'Аноним не может читать задачи'); // Отсутствие JWT закрывает таблицы полностью.
await denied(call(anon, 'save_project', { p_id: null, p_name: 'Обход', p_address: 'Обход' }), 'Аноним не может вызывать операции'); // Проверяем права EXECUTE.
const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } }).then(r => r.json()); ok(settings.disable_signup === true, 'Открытая регистрация отключена в Auth'); // Проверяем реальную настройку сервера без создания лишнего аккаунта.
const projectArgs = { p_id: foreignProject.id, p_name: 'Подмена', p_address: 'Подмена' }; // Готовим чужой UUID вместо скрытой кнопки.
await denied(call(clients.manager, 'save_project', projectArgs), 'Постановщик не редактирует чужой объект'); // Проверяем прямой вызов RPC.
await denied(call(clients.manager, 'delete_project', { p_id: foreignProject.id }), 'Постановщик не удаляет чужой объект'); // UUID не даёт право удаления.
await denied(call(clients.executor1, 'save_project', { ...projectArgs, p_id: null }), 'Исполнитель не создаёт объект'); // Проверяем роль в функции.
await denied(call(clients.manager, 'delete_project', { p_id: ownProject.id }), 'Нельзя удалить объект с задачами'); // Проверяем правило непустого объекта.
await denied(clients.executor1.from('profiles').update({ is_manager: true }).eq('id', ids.executor1), 'Нельзя повысить собственную роль'); // Роли находятся вне пользовательских metadata.
const sample = managersTasks[0]; const foreignTask = mixedTasks.find(t => t.author_id === ids.mixed); // Берём известные записи для атаки.
await denied(clients.manager.from('tasks').update({ status: 'accepted' }).eq('id', sample.id), 'Прямая смена статуса через таблицу закрыта'); // Даже автор обязан пройти серверную операцию.
await denied(clients.executor1.from('tasks').update({ title: 'Подмена' }).eq('id', sample.id), 'Исполнитель не меняет поля через таблицу'); // Отдельно проверяем запрет UPDATE.
await denied(clients.manager.from('tasks').insert({ project_id: ownProject.id, author_id: ids.manager, assignee_id: ids.executor1, title: 'Подмена', status: 'accepted' }), 'Нельзя создать задачу сразу принятой'); // Запрещаем обход начального статуса.
await denied(clients.manager.from('tasks').delete().eq('id', sample.id), 'Физическое удаление задачи через таблицу закрыто'); // История не удаляется каскадом.
await denied(clients.manager.from('task_history').insert({ task_id: sample.id, actor_id: ids.executor1, actor_name: 'Подмена', to_status: 'accepted' }), 'Нельзя подделать событие истории'); // Проверяем отдельный INSERT в аудит.
await denied(clients.manager.from('task_history').update({ comment: 'Подмена' }).eq('task_id', sample.id), 'Нельзя изменить историю'); // Проверяем неизменяемость событий.
await denied(clients.manager.from('task_history').delete().eq('task_id', sample.id), 'Нельзя удалить историю'); // Проверяем DELETE аудита.
await denied(call(clients.manager, 'transition_task', { p_id: foreignTask.id, p_to: 'in_progress', p_comment: '', p_version: foreignTask.version }), 'Чужой UUID не позволяет сменить статус'); // Проверяем RPC в обход списка.
const tempProject = await allowed(call(clients.manager, 'save_project', { p_id: null, p_name: 'Проверка безопасности · временный', p_address: 'Тестовые данные' })); // Создаём отдельный объект для изменяющих тестов.
const createArgs = { p_id: null, p_project_id: tempProject, p_title: 'Тест цикла', p_description: '', p_assignee_id: ids.executor1, p_version: null }; // Подготавливаем корректную новую задачу.
const tempTask = await allowed(call(clients.manager, 'save_task', createArgs)); // Дальше меняем только эту тестовую запись.
try { // Гарантируем логическую очистку даже после падения проверки.
  await denied(call(clients.manager, 'save_task', { ...createArgs, p_project_id: foreignProject.id }), 'Нельзя создать задачу в чужом объекте'); // Проверяем принадлежность объекта.
  await denied(call(clients.executor1, 'save_task', createArgs), 'Исполнитель не создаёт задачу'); // Проверяем запрет создания по роли.
  await denied(call(clients.manager, 'save_task', { ...createArgs, p_assignee_id: ids.manager }), 'Нельзя назначить пользователя без роли исполнителя'); // Роль назначения проверяет база.
  let task = (await rows(clients.manager, 'tasks')).find(t => t.id === tempTask); // Получаем серверную версию.
  await denied(call(clients.manager, 'save_task', { ...createArgs, p_id: tempTask, p_project_id: ownProject.id, p_version: task.version }), 'Нельзя перенести задачу в другой собственный объект'); // Связь с объектом неизменяема.
  await allowed(call(clients.manager, 'save_task', { ...createArgs, p_id: tempTask, p_assignee_id: ids.executor2, p_version: task.version })); // До старта переназначение разрешено.
  ok(!(await rows(clients.executor1, 'tasks')).some(t => t.id === tempTask), 'После переназначения прежний исполнитель теряет доступ'); // Проверяем немедленное применение RLS.
  task = (await rows(clients.manager, 'tasks')).find(t => t.id === tempTask); // Обновляем версию после правки.
  await allowed(call(clients.manager, 'save_task', { ...createArgs, p_id: tempTask, p_version: task.version })); // Возвращаем назначение первому исполнителю до старта.
  const states = ['new', 'in_progress', 'in_review', 'accepted', 'rework']; // Перебираем полный список статусов.
  const path = [['executor1', 'in_progress'], ['executor1', 'in_review'], ['manager', 'rework'], ['executor1', 'in_progress'], ['executor1', 'in_review'], ['manager', 'accepted']]; // Проверяем весь цикл, включая повторную работу.
  for (const [role, to] of path) { // На каждом шаге проверяем разрешённые и запрещённые действия.
    task = (await rows(clients.manager, 'tasks')).find(t => t.id === tempTask); // Берём актуальный статус и версию.
    for (const actor of ['manager', 'executor1', 'executor2', 'mixed']) for (const target of states) { // Проверяем все пары участник/целевой статус.
      const permitted = actor === 'executor1' && ((['new', 'rework'].includes(task.status) && target === 'in_progress') || (task.status === 'in_progress' && target === 'in_review')) || actor === 'manager' && task.status === 'in_review' && ['accepted', 'rework'].includes(target); // Независимо описываем матрицу требований.
      if (!permitted) await denied(call(clients[actor], 'transition_task', { p_id: tempTask, p_to: target, p_comment: 'Тест', p_version: task.version }), `${task.status}: ${actor} → ${target} запрещён`); // Проверяем каждый недопустимый переход реальным запросом.
    } // Завершаем отрицательную матрицу для состояния.
    if (to === 'rework') await denied(call(clients.manager, 'transition_task', { p_id: tempTask, p_to: to, p_comment: '   ', p_version: task.version }), 'Возврат с пустым комментарием запрещён'); // Пробелы не считаются причиной.
    if (task.status !== 'new') await denied(call(clients.manager, 'save_task', { ...createArgs, p_id: tempTask, p_title: 'Изменение после старта', p_version: task.version }), 'Редактирование после старта запрещено'); // Запрет действует и на доработке.
    await allowed(call(clients[role], 'transition_task', { p_id: tempTask, p_to: to, p_comment: 'Проверено тестом', p_version: task.version })); // Выполняем разрешённый переход по ТЗ.
    await denied(call(clients[role], 'transition_task', { p_id: tempTask, p_to: to, p_comment: 'Повтор', p_version: task.version }), 'Устаревшая версия отклоняется', ['PT409']); // Повторный запрос не создаёт второе событие.
  } // Завершаем рабочий цикл.
  const history = (await rows(clients.manager, 'task_history')).filter(h => h.task_id === tempTask); // Проверяем историю всего цикла.
  ok(history.length === 7 && history.filter(h => h.to_status === 'rework').every(h => h.comment.trim()), 'История содержит создание и ровно 6 успешных переходов'); // Запрещённые запросы не оставляют событий.
  ok(history.every(h => h.actor_id === (['in_progress', 'in_review'].includes(h.to_status) ? ids.executor1 : ids.manager)), 'Автор каждого события определён текущей сессией'); // Клиент не подменяет участника.
  task = (await rows(clients.manager, 'tasks')).find(t => t.id === tempTask); // Находим финальную версию принятой задачи.
  for (const target of states) await denied(call(clients.executor1, 'transition_task', { p_id: tempTask, p_to: target, p_comment: '', p_version: task.version }), `Принятая задача не переходит в ${target}`); // Принятое состояние является конечным.
  const raceTask = await allowed(call(clients.manager, 'save_task', { ...createArgs, p_title: 'Тест одновременного старта' })); // Создаём отдельную задачу для гонки.
  const raceArgs = { p_id: raceTask, p_to: 'in_progress', p_comment: '', p_version: 1 }; // Два запроса используют одну версию.
  const race = await Promise.all([call(clients.executor1, 'transition_task', raceArgs), call(clients.executor1, 'transition_task', raceArgs)]); // Имитируем параллельный клик или два браузера.
  ok(race.filter(r => !r.error).length === 1 && race.some(r => r.error?.code === 'PT409'), 'Из двух конкурентных переходов проходит ровно один'); // Блокировка строки предотвращает двойную запись.
  await allowed(call(clients.manager, 'delete_task', { p_id: raceTask, p_version: 2 })); // Логически убираем задачу гонки.
} finally { // Удаляем все оставшиеся записи временного объекта.
  const tasks = await rows(clients.manager, 'tasks'); for (const task of tasks.filter(t => t.project_id === tempProject)) await allowed(call(clients.manager, 'delete_task', { p_id: task.id, p_version: task.version })); // Используем разрешённую операцию вместо физического DELETE.
  await allowed(call(clients.manager, 'delete_project', { p_id: tempProject })); // Пустой объект после задач удаляется успешно.
} // Завершаем очистку.
ok(!(await rows(clients.manager, 'projects')).some(p => p.id === tempProject), 'Удалённый объект скрыт от чтения'); // Проверяем результат логического удаления.
ok(!(await rows(clients.executor1, 'tasks')).some(t => t.project_id === tempProject), 'Удалённые задачи скрыты у исполнителя'); // Остаточные назначения не открывают архив.
console.log(`Успешно: ${checks} проверок реального Supabase API.`); // Выводим итог без тестовых паролей.
