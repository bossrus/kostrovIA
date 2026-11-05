// Файл реализует отдельный экран TaskPage; доступные строки предоставляет база через RLS.
import { useState } from 'react'; // Управляем действиями карточки.
import { Link, useParams } from 'react-router-dom'; // Читаем UUID задачи.
import { ArrowLeft, ArrowUpRight, Pencil, Trash2, Clock3 } from 'lucide-react'; // Подключаем иконки задачи.
import type { Data } from '../../hooks/useWorkspaceData'; // Получаем разрешённые данные.
import { actions, date, statuses, type Status } from '../../domain'; // Используем подписи и допустимые кнопки.
import { NotAvailable } from '../../components/feedback/NotAvailable'; // Показываем безопасное отсутствие записи.
import { Badge } from '../../components/ui/Badge'; // Отображаем текущий статус.
import { TaskEditor } from '../../components/forms/TaskEditor'; // Редактируем задачу в любом статусе.
import { Transition } from '../../components/forms/Transition'; // Подтверждаем смену статуса.
import { DeleteDialog } from '../../components/forms/DeleteDialog'; // Подтверждаем удаление задачи.
export function TaskPage({data}: { data: Data }) { // Показываем содержание, разрешённые переходы и неизменяемую историю.
    const {id} = useParams();
    const [edit, setEdit] = useState(false);
    const [remove, setRemove] = useState(false);
    const [transition, setTransition] = useState<{ to: Status; label: string } | null>(null); // Управляем диалогами карточки.
    const task = data.tasks.find(item => item.id === id);
    if (!task) return <NotAvailable/>; // Чужой UUID не даёт доступа к карточке.
    const project = data.projects.find(item => item.id === task.project_id);
    const canManage = data.me.is_manager;
    const history = data.history.filter(event => event.task_id === task.id); // Выбираем только историю открытой задачи.
    const name = (userId: string) => data.people.find(person => person.id === userId)?.display_name ?? 'Пользователь'; // Безопасно отображаем доступные имена.
    return <><Link className="back" to={`/projects/${task.project_id}`}><ArrowLeft
        size={16}/>{project?.name ?? 'К объекту'}</Link>
        <div className="page-heading">
            <div><p className="eyebrow">КАРТОЧКА ЗАДАЧИ</p><h1>{task.title}</h1></div>
            {canManage && <div className="toolbar">
                <button className="button secondary" onClick={() => setEdit(true)}><Pencil size={16}/>Изменить</button>
                <button className="icon-button delete" aria-label="Удалить задачу" onClick={() => setRemove(true)}>
                    <Trash2 size={18}/></button>
            </div>}</div>
        <div className="detail-grid">
            <section className="panel task-detail"><Badge status={task.status}/><h2>Что нужно сделать</h2><p
                className="description">{task.description || 'Описание не добавлено.'}</p>
                <dl className="task-meta">
                    <div>
                        <dt>Объект</dt>
                        <dd><Link to={`/projects/${task.project_id}`}>{project?.name ?? 'Объект'}</Link></dd>
                    </div>
                    <div>
                        <dt>Исполнитель</dt>
                        <dd>{name(task.assignee_id)}</dd>
                    </div>
                    <div>
                        <dt>Постановщик</dt>
                        <dd>{name(task.author_id)}</dd>
                    </div>
                    <div>
                        <dt>Создана</dt>
                        <dd>{date(task.created_at)}</dd>
                    </div>
                </dl>
                <div className="task-actions">{actions(task, data.me).map(action => <button key={action.to}
                                                                                            className={`button ${action.to === 'rework' ? 'secondary' : 'primary'}`}
                                                                                            onClick={() => setTransition(action)}>{action.label}<ArrowUpRight
                    size={16}/></button>)}{!actions(task, data.me).length &&
                    <p className="hint">{task.status === 'accepted' ? 'Работа принята. Задача завершена.' : 'Сейчас действие ожидается от другого участника.'}</p>}</div>
            </section>
            <section className="panel history"><h2><Clock3 size={19}/>История задачи</h2><p className="hint">Все
                изменения статуса сохраняются автоматически.</p>
                <ol>{history.map(event => <li key={event.id}><span className={`history-dot ${event.to_status}`}/>
                    <div className="history-event">
                        <strong>{event.from_status ? `${statuses[event.from_status]} → ${statuses[event.to_status]}` : 'Задача создана'}</strong><span>{event.actor_name}</span>{event.comment &&
                        <blockquote>{event.comment}</blockquote>}
                        <time dateTime={event.created_at}>{date(event.created_at)}</time>
                    </div>
                </li>)}</ol>
                {!history.length && <p className="hint">История ещё не загружена. Обновите данные.</p>}</section>
        </div>
        {edit &&
            <TaskEditor data={data} projectId={task.project_id} task={task} close={() => setEdit(false)}/>}{remove &&
            <DeleteDialog data={data} task={task} close={() => setRemove(false)}/>}{transition &&
            <Transition data={data} task={task} {...transition} close={() => setTransition(null)}/>}</>; // История выводится текстом без опасного HTML.
} // Завершаем карточку задачи.
