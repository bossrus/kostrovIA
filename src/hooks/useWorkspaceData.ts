// Файл загружает только разрешённые RLS данные и объединяет обновление экранов после операций.
import { useCallback, useEffect, useRef, useState } from 'react'; // Управляем загрузкой и защищаемся от устаревших ответов.
import { db, fail } from '../lib/supabase'; // Используем общий клиент и проверку ошибок.
import type { Profile, Project, Task, History } from '../domain'; // Подключаем типы строк базы.
export interface Data { me: Profile; people: Profile[]; projects: Project[]; tasks: Task[]; history: History[]; reload: () => Promise<void> } // Передаём экранам единый согласованный снимок.
export function useData(userId: string) { // Создаём отдельное состояние для текущего аккаунта.
  const [data, setData] = useState<Omit<Data, 'reload'> | null>(null); // Не показываем старые данные во время первого входа.
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); // Различаем ошибку и ожидание сети.
  const request = useRef(0); // Каждый запрос получает собственный порядковый номер.
  const reload = useCallback(async () => { // Обновляем весь небольшой рабочий набор.
    const current = ++request.current; setLoading(true); setError(''); // Отмечаем начало актуальной загрузки.
    try { // Обрабатываем как сетевые, так и серверные ошибки.
      const results = await Promise.all([db().from('profiles').select('*'), db().from('projects').select('*').order('created_at', { ascending: false }), db().from('tasks').select('*').order('created_at', { ascending: false }), db().from('task_history').select('*').order('created_at', { ascending: false })]); // Независимые SELECT выполняются параллельно под RLS.
      results.forEach(result => fail(result.error)); // Не подменяем отказ доступа пустым списком.
      const people = results[0].data as Profile[]; const me = people.find(person => person.id === userId); // Находим защищённый профиль текущего пользователя.
      if (!me) throw new Error('Администратор ещё не назначил вам роль. Добавьте профиль в Supabase.'); // Auth-аккаунт без профиля ничего не открывает.
      if (current === request.current) setData({ me, people, projects: results[1].data as Project[], tasks: results[2].data as Task[], history: results[3].data as History[] }); // Игнорируем ответ старого запроса.
    } catch (reason) { // Сохраняем доступное для пользователя описание ошибки.
      if (current === request.current) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить данные'); // Не показываем устаревшую ошибку.
    } finally { if (current === request.current) setLoading(false); } // Завершаем индикатор только для актуального запроса.
  }, [userId]); // Пересоздаём загрузку при смене аккаунта.
  useEffect(() => { void reload(); return () => { ++request.current; }; }, [reload]); // При размонтировании аннулируем незавершённые ответы.
  return { data: data ? { ...data, reload } : null, error, loading, reload }; // Предоставляем состояние оболочке приложения.
} // Завершаем хук загрузки.
