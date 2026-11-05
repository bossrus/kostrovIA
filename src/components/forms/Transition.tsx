// Файл содержит отдельный компонент Transition; сервер повторно проверяет каждую операцию.
import { useState } from 'react'; // Храним комментарий действия.
import type { Data } from '../../hooks/useWorkspaceData'; // Обновляем данные после перехода.
import { rpc } from '../../lib/api'; // Вызываем единственную операцию смены статуса.
import type { Task, Status } from '../../domain'; // Типизируем задачу и целевой статус.
import { Field } from '../ui/Field'; // Подписываем поле комментария.
import { Modal } from '../ui/Modal'; // Открываем подтверждение перехода.
import { SubmitForm } from './SubmitForm'; // Блокируем повторную отправку.
export function Transition({data, task, to, label, close}: {
    data: Data;
    task: Task;
    to: Status;
    label: string;
    close: () => void
}) { // Подтверждаем действие и собираем комментарий.
    const [comment, setComment] = useState(''); // Не переносим комментарий из предыдущего статуса.
    async function save() {
        await rpc('transition_task', {p_id: task.id, p_to: to, p_comment: comment, p_version: task.version});
        await data.reload();
        close();
    } // Сервер проверяет граф переходов и записывает историю.
    return <Modal title={label} close={close}><SubmitForm submit={save} label={label}><p
        className="form-context">{task.title}</p><Field
        label={to === 'rework' ? 'Причина возврата · обязательно' : 'Комментарий · необязательно'}><textarea autoFocus
                                                                                                             rows={4}
                                                                                                             required={to === 'rework'}
                                                                                                             maxLength={2000}
                                                                                                             value={comment}
                                                                                                             onChange={event => setComment(event.target.value)}
                                                                                                             placeholder={to === 'rework' ? 'Опишите, что нужно исправить' : 'Добавьте детали, если нужно'}/></Field>
        <p className="hint">Действие и комментарий сохранятся в истории задачи.</p></SubmitForm></Modal>; // Обязательность причины дополнительно проверяется PostgreSQL.
} // Завершаем диалог перехода.
