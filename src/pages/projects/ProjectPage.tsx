// Файл реализует отдельный экран ProjectPage; доступные строки предоставляет база через RLS.
import {useState} from 'react'; // Управляем диалогами объекта.
import {Link, useParams} from 'react-router-dom'; // Читаем UUID и возвращаемся к списку.
import {ArrowLeft, MapPin, Pencil, Plus, Trash2} from 'lucide-react'; // Подключаем иконки действий.
import type {Data} from '../../hooks/useWorkspaceData'; // Получаем данные под RLS.
import {NotAvailable} from '../../components/feedback/NotAvailable'; // Не раскрываем существование чужого объекта.
import {TaskList} from '../../components/ui/TaskList'; // Показываем задачи объекта.
import {ProjectEditor} from '../../components/forms/ProjectEditor'; // Любой постановщик может редактировать стройку.
import {TaskEditor} from '../../components/forms/TaskEditor'; // Создаём задачи этого объекта.
import {DeleteDialog} from '../../components/forms/DeleteDialog'; // Подтверждаем логическое удаление.
export function ProjectPage({data}: { data: Data }) { // Показываем объект и доступную часть списка его задач.
    const {id} = useParams();
    const [editor, setEditor] = useState(false);
    const [createTask, setCreateTask] = useState(false);
    const [remove, setRemove] = useState(false); // Храним независимые модальные действия.
    const project = data.projects.find(item => item.id === id);
    if (!project) return <NotAvailable/>; // Не открываем объект, отсутствующий в RLS-снимке.
    const tasks = data.tasks.filter(task => task.project_id === project.id);
    const canManage = data.me.is_manager; // Управление доступно всем постановщикам независимо от автора объекта.
    const canDelete = canManage && tasks.length === 0; // Показываем удаление постановщикам у пустого объекта.
    return <><Link className="back" to="/projects"><ArrowLeft size={16}/>Все объекты</Link>
        <div className="page-heading">
            <div><p className="eyebrow">КАРТОЧКА ОБЪЕКТА</p><h1>{project.name}</h1><p className="address"><MapPin
                size={17}/>{project.address}</p></div>
            {canManage && <div className="toolbar">
                <button className="button secondary" onClick={() => setEditor(true)}><Pencil size={16}/>Изменить
                </button>
                {canDelete &&
                    <button className="icon-button delete" aria-label="Удалить объект" onClick={() => setRemove(true)}>
                        <Trash2 size={18}/></button>}
            </div>}</div>
        <section className="panel">
            <div className="panel-heading"><h2>Задачи объекта <span
                className="heading-count small">{tasks.length}</span></h2>{canManage &&
                <button className="button primary" onClick={() => setCreateTask(true)}><Plus size={17}/>Новая задача
                </button>}</div>
            {!canManage && <p className="scope-note">Показаны только назначенные вам задачи этого объекта.</p>}<TaskList
            tasks={tasks} people={data.people}/></section>
        {editor && <ProjectEditor data={data} project={project} close={() => setEditor(false)}/>}{createTask &&
            <TaskEditor data={data} projectId={project.id} close={() => setCreateTask(false)}/>}{remove &&
            <DeleteDialog data={data} project={project} close={() => setRemove(false)}/>}</>; // Все реальные операции повторно проверяются RPC.
} // Завершаем карточку объекта.
