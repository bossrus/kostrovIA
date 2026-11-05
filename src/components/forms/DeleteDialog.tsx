// Файл содержит отдельный компонент DeleteDialog; сервер повторно проверяет каждую операцию.
import { useNavigate } from 'react-router-dom'; // Возвращаемся к родительскому списку.
import type { Data } from '../../hooks/useWorkspaceData'; // Обновляем видимые записи после удаления.
import { rpc } from '../../lib/api'; // Удаляем через серверную проверку роли постановщика.
import type { Project, Task } from '../../domain'; // Типизируем удаляемую запись.
import { Modal } from '../ui/Modal'; // Показываем подтверждение.
import { SubmitForm } from './SubmitForm'; // Показываем ошибку запрета удаления.
export function DeleteDialog({data, project, task, close}: {
    data: Data;
    project?: Project;
    task?: Task;
    close: () => void
}) { // Просим подтверждение перед удалением из интерфейса.
    const navigate = useNavigate(); // Возвращаем пользователя к родительскому списку.
    async function remove() {
        if (task) await rpc('delete_task', {
            p_id: task.id,
            p_version: task.version
        }); else await rpc('delete_project', {p_id: project!.id});
        await data.reload();
        close();
        navigate(task ? `/projects/${task.project_id}` : '/projects');
    } // Объект с неудалёнными задачами сервер удалить не позволит.
    return <Modal title={task ? 'Удалить задачу?' : 'Удалить объект?'} close={close}><SubmitForm submit={remove}
                                                                                                 label="Удалить" danger>
        <p className="form-context">{task?.title ?? project?.name}</p><p className="hint">Запись исчезнет из рабочего
        пространства. История останется в
        базе.{project && ' Удаление возможно только после удаления всех задач объекта.'}</p></SubmitForm></Modal>; // Честно описываем логическое удаление.
} // Завершаем подтверждение удаления.
