// Файл реализует отдельный экран MyTasksPage; доступные строки предоставляет база через RLS.
import {useState} from 'react'; // Храним локальные фильтры.
import {Search} from 'lucide-react'; // Обозначаем поиск.
import type {Data} from '../../hooks/useWorkspaceData'; // Получаем видимые назначения.
import {type Status, statuses} from '../../domain'; // Типизируем фильтр статусов.
import {TaskList} from '../../components/ui/TaskList'; // Используем единый список задач.
export function MyTasksPage({data}: { data: Data }) { // Даём исполнителю общий список его назначений.
    const [status, setStatus] = useState<Status | ''>('');
    const [search, setSearch] = useState(''); // Храним локальные фильтры.
    const mine = data.tasks.filter(task => task.assignee_id === data.me.id);
    const tasks = mine.filter(task => (!status || task.status === status) && task.title.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru').trim())); // Не включаем задачи, созданные смешанной ролью для других людей.
    return <>
        <div className="page-heading">
            <div><p className="eyebrow">ЛИЧНАЯ РАБОТА</p><h1>Мои задачи<span
                className="heading-count">{mine.length}</span></h1><p>Ваши назначения по всем доступным объектам.</p>
            </div>
        </div>
        <div className="section-bar filters"><label className="search"><Search size={17}/><input
            aria-label="Поиск задач" placeholder="Найти задачу…" value={search}
            onChange={event => setSearch(event.target.value)}/></label><select aria-label="Фильтр по статусу"
                                                                               value={status}
                                                                               onChange={event => setStatus(event.target.value as Status | '')}>
            <option value="">Все статусы</option>
            {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></div>
        <section className="panel"><TaskList tasks={tasks} people={data.people}
                                             projectName={projectId => data.projects.find(project => project.id === projectId)?.name ?? 'Объект'}/>
        </section>
    </>; // Фильтрация не заменяет RLS и не открывает дополнительные записи.
} // Завершаем личный список задач.
