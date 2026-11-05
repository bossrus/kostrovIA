// Файл содержит переиспользуемый элемент интерфейса TaskList.
import { ArrowUpRight } from 'lucide-react'; // Обозначаем переход к задаче.
import { Link } from 'react-router-dom'; // Строим переходы без перезагрузки.
import type { Task, Profile } from '../../domain'; // Типизируем строки списка.
import { Badge } from './Badge'; // Показываем статус каждой задачи.
import { Empty } from './Empty'; // Объясняем отсутствие назначений.
export function TaskList({ tasks, people, projectName }: { tasks: Task[]; people: Profile[]; projectName?: (id: string) => string }) { // Отображаем задачи с именами исполнителей.
  if (!tasks.length) return <Empty title="Задач пока нет" text="Здесь появятся доступные вам задачи." />; // Не показываем пустую таблицу.
  return <div className="task-list">{tasks.map(task => <Link className="task-row" key={task.id} to={`/tasks/${task.id}`}><div className="task-title"><strong>{task.title}</strong><span>{projectName?.(task.project_id) ?? people.find(p => p.id === task.assignee_id)?.display_name ?? 'Исполнитель'}</span></div><Badge status={task.status} /><ArrowUpRight size={18} className="muted" /></Link>)}</div>; // Каждая строка открывает полноценную карточку задачи.
} // Завершаем список задач.
