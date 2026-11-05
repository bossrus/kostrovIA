// Файл содержит отдельный компонент TaskEditor; сервер повторно проверяет каждую операцию.
import { useState } from 'react'; // Храним редактируемые поля задачи.
import { useNavigate } from 'react-router-dom'; // Открываем сохранённую задачу.
import type { Data } from '../../hooks/useWorkspaceData'; // Получаем список исполнителей и обновление.
import { rpc } from '../../lib/api'; // Используем защищённую операцию сохранения.
import type { Task } from '../../domain'; // Типизируем исходную задачу.
import { Field } from '../ui/Field'; // Подписываем поля.
import { Modal } from '../ui/Modal'; // Управляем модальным окном.
import { SubmitForm } from './SubmitForm'; // Обрабатываем серверный отказ без потери полей.
export function TaskEditor({data, projectId, task, close}: {
    data: Data;
    projectId: string;
    task?: Task;
    close: () => void
}) { // Редактируем новую задачу без переноса в другой объект.
    const executors = data.people.filter(person => person.is_executor);
    const navigate = useNavigate(); // Показываем только пользователей с ролью исполнителя.
    const [title, setTitle] = useState(task?.title ?? '');
    const [description, setDescription] = useState(task?.description ?? '');
    const [assignee, setAssignee] = useState(task?.assignee_id ?? ''); // Храним редактируемые поля отдельно от серверной модели.
    async function save() {
        const id = await rpc('save_task', {
            p_id: task?.id ?? null,
            p_project_id: projectId,
            p_title: title,
            p_description: description,
            p_assignee_id: assignee,
            p_version: task?.version ?? null
        });
        await data.reload();
        close();
        navigate(`/tasks/${id}`);
    } // Версия предотвращает изменение уже взятой в работу задачи.
    return <Modal title={task ? 'Редактировать задачу' : 'Новая задача'} close={close}><SubmitForm submit={save}><Field
        label="Название задачи"><input autoFocus required maxLength={200} value={title}
                                       onChange={event => setTitle(event.target.value)}
                                       placeholder="Что нужно сделать?"/></Field><Field label="Описание"><textarea
        rows={5} maxLength={10000} value={description} onChange={event => setDescription(event.target.value)}
        placeholder="Детали и ожидаемый результат"/></Field><Field label="Исполнитель"><select required value={assignee}
                                                                                               onChange={event => setAssignee(event.target.value)}>
        <option value="" disabled>Выберите исполнителя</option>
        {executors.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}
    </select></Field>{!executors.length && <p className="error">Сначала добавьте исполнителей в Supabase.</p>}<p
        className="hint">Объект закреплён за задачей. Изменять данные можно до начала работы.</p></SubmitForm></Modal>; // Не предлагаем изменение автора, даты и статуса.
} // Завершаем редактор задачи.
