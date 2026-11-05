// Файл заполняет demo-базу обычными пользовательскими запросами; service_role и прямые правки статусов не используются.
import { createClient } from '@supabase/supabase-js'; // Подключаем тот же SDK, что работает во фронтенде.
import { readFile } from 'node:fs/promises'; // Читаем игнорируемый Git файл с тестовыми доступами.
const credentials = JSON.parse(await readFile(new URL('../demo-credentials.local', import.meta.url), 'utf8')); // Пароли не попадают в отслеживаемые файлы.
const { mixed: legacyManager, ...accounts } = credentials;
accounts.manager2 ??= legacyManager; // Сохраняем совместимость старого локального файла; mixed теперь только постановщик.
const clients = {}; // Храним изолированную сессию каждого аккаунта.
for (const [role, account] of Object.entries(accounts)) { // Авторизуем четыре независимых клиента.
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); // Используем только публичный ключ.
  const result = await client.auth.signInWithPassword(account); if (result.error) throw result.error; clients[role] = client; // Не продолжаем при ошибке входа.
} // Завершаем авторизацию.
async function rpc(client, name, args) { const result = await client.rpc(name, args); if (result.error) throw result.error; return result.data; } // Проверяем каждый ответ сервера.
async function user(client) { return (await client.auth.getUser()).data.user.id; } // Получаем настоящий UUID текущей сессии.
const ids = Object.fromEntries(await Promise.all(Object.entries(clients).map(async ([role, client]) => [role, await user(client)]))); // Разрешаем email в UUID через Auth.
const existing = await clients.manager.from('projects').select('id'); if (existing.error) throw existing.error; if (existing.data.length) throw new Error('Demo уже заполнено: seed остановлен без изменений.'); // Исключаем случайное дублирование примеров.
const p1 = await rpc(clients.manager, 'save_project', { p_id: null, p_name: 'ЖК «Сосновый парк»', p_address: 'Бишкек, ул. Токтоналиева, 18' }); // Создаём первый объект основного постановщика.
const p2 = await rpc(clients.manager, 'save_project', { p_id: null, p_name: 'Бизнес-центр «Горизонт»', p_address: 'Бишкек, проспект Чуй, 112' }); // Создаём второй доступный ему объект.
const p3 = await rpc(clients.manager2, 'save_project', { p_id: null, p_name: 'Складской комплекс «Север»', p_address: 'Бишкек, ул. Фучика, 7' }); // Создаём общий объект от имени второго постановщика.
async function task(client, project, title, assignee, description) { return rpc(client, 'save_task', { p_id: null, p_project_id: project, p_title: title, p_description: description, p_assignee_id: ids[assignee], p_version: null }); } // Создаём задачу исключительно в начальном статусе.
async function move(client, id, to, comment = '') { const current = await client.from('tasks').select('version').eq('id', id).single(); if (current.error) throw current.error; await rpc(client, 'transition_task', { p_id: id, p_to: to, p_comment: comment, p_version: current.data.version }); } // Воспроизводим настоящий рабочий цикл с историей.
await task(clients.manager, p1, 'Проверить разметку фундамента', 'executor1', 'Сверить оси с проектом и зафиксировать отклонения до начала заливки.'); // Оставляем пример новой задачи.
const t2 = await task(clients.manager, p1, 'Подготовить ведомость материалов', 'executor2', 'Составить список материалов для второго этажа с указанием объёмов.'); // Готовим задачу для старта.
await move(clients.executor2, t2, 'in_progress', 'Сверяю объёмы с чертежами.'); // Создаём статус в работе через исполнителя.
const t3 = await task(clients.manager, p1, 'Принять армирование перекрытия', 'executor1', 'Проверить шаг арматуры, защитный слой и соответствие проекту.'); // Готовим сдачу на проверку.
await move(clients.executor1, t3, 'in_progress'); await move(clients.executor1, t3, 'in_review', 'Проверка выполнена. Замечаний к армированию нет.'); // Оставляем результат на рассмотрении автора.
const t4 = await task(clients.manager, p2, 'Согласовать схему электроснабжения', 'executor2', 'Подготовить актуальную схему и проверить маркировку распределительных щитов.'); // Создаём пример возврата.
await move(clients.executor2, t4, 'in_progress'); await move(clients.executor2, t4, 'in_review'); await move(clients.manager, t4, 'rework', 'Укажите номиналы автоматов и добавьте маркировку щита ЩР-2.'); // Показываем обязательный комментарий в истории.
const t5 = await task(clients.manager, p2, 'Проверить монтаж окон', 'executor1', 'Осмотреть крепления, монтажные швы и открывание створок на первом этаже.'); // Готовим завершённую задачу.
await move(clients.executor1, t5, 'in_progress'); await move(clients.executor1, t5, 'in_review'); await move(clients.manager, t5, 'accepted', 'Результат принят, замечаний нет.'); // Формируем принятую задачу без обхода ограничений.
await task(clients.manager, p2, 'Провести обход площадки', 'executor1', 'Проверить временные ограждения и безопасные проходы.'); // Назначаем только пользователя с ролью исполнителя.
await task(clients.manager2, p3, 'Подготовить площадку под разгрузку', 'executor2', 'Освободить зону разгрузки и проверить подъездные пути.'); // Оба постановщика видят эту задачу.
await task(clients.manager2, p3, 'Проверить освещение склада', 'executor1', 'Проверить освещённость проходов и исправность аварийных светильников.'); // Постановщик и исполнитель — разные пользователи.
console.log('Demo создано: 3 объекта, 8 задач, все пять статусов и история реальных переходов.'); // Не печатаем пароли или токены.
