// Файл описывает данные CRM и отображение статусов; окончательные права всегда проверяет база.
export type Status = 'new' | 'in_progress' | 'in_review' | 'accepted' | 'rework'; // Повторяем фиксированный enum PostgreSQL.
export interface Profile { id: string; display_name: string; is_manager: boolean; is_executor: boolean } // Один профиль может совмещать обе роли.
export interface Project { id: string; owner_id: string; name: string; address: string; created_at: string } // Описываем видимую стройку.
export interface Task { id: string; project_id: string; author_id: string; assignee_id: string; title: string; description: string; status: Status; created_at: string; version: number } // Версия предотвращает применение устаревших действий.
export interface History { id: string; task_id: string; actor_id: string; actor_name: string; from_status: Status | null; to_status: Status; comment: string | null; created_at: string } // История приходит только из базы.
export const statuses: Record<Status, string> = { new: 'Новая', in_progress: 'В работе', in_review: 'На проверке', accepted: 'Принята', rework: 'На доработке' }; // Используем единые русские названия.
export const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); // Показываем время в часовом поясе браузера.
export function actions(task: Task, me: Profile): { to: Status; label: string }[] { // Рассчитываем доступные кнопки без выдачи дополнительных прав.
  const result: { to: Status; label: string }[] = []; // Начинаем с отсутствия действий.
  if (me.is_executor && task.assignee_id === me.id && ['new', 'rework'].includes(task.status)) result.push({ to: 'in_progress', label: 'Взять в работу' }); // Назначенный исполнитель начинает работу.
  if (me.is_executor && task.assignee_id === me.id && task.status === 'in_progress') result.push({ to: 'in_review', label: 'Отправить на проверку' }); // Исполнитель сдаёт результат.
  if (me.is_manager && task.author_id === me.id && task.status === 'in_review') result.push({ to: 'accepted', label: 'Принять задачу' }, { to: 'rework', label: 'Вернуть на доработку' }); // Автор принимает либо возвращает результат.
  return result; // Совмещение ролей естественно объединяет действия.
} // Завершаем вычисление кнопок.
