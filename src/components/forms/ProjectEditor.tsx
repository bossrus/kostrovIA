// Файл содержит отдельный компонент ProjectEditor; сервер повторно проверяет каждую операцию.
import { useState } from 'react'; // Храним значения названия и адреса.
import { useNavigate } from 'react-router-dom'; // Открываем сохранённый объект.
import type { Data } from '../../hooks/useWorkspaceData'; // Получаем обновление общего снимка.
import { rpc } from '../../lib/api'; // Сохраняем через защищённую функцию базы.
import type { Project } from '../../domain'; // Типизируем редактируемый объект.
import { Field } from '../ui/Field'; // Подписываем поля формы.
import { Modal } from '../ui/Modal'; // Открываем доступное модальное окно.
import { SubmitForm } from './SubmitForm'; // Обрабатываем отправку и ошибки.
export function ProjectEditor({data, project, close}: { data: Data; project?: Project; close: () => void }) { // Создаём объект или изменяем объект любого постановщика.
    const [name, setName] = useState(project?.name ?? '');
    const [address, setAddress] = useState(project?.address ?? '');
    const navigate = useNavigate(); // Заполняем исходные значения.
    async function save() {
        const id = await rpc('save_project', {p_id: project?.id ?? null, p_name: name, p_address: address});
        await data.reload();
        close();
        navigate(`/projects/${id}`);
    } // Владелец определяется базой по JWT.
    return <Modal title={project ? 'Редактировать объект' : 'Новый объект'} close={close}><SubmitForm
        submit={save}><Field label="Название объекта"><input autoFocus required maxLength={160} value={name}
                                                             onChange={event => setName(event.target.value)}
                                                             placeholder="Например, ЖК «Сосновый парк»"/></Field><Field
        label="Адрес"><input required maxLength={500} value={address} onChange={event => setAddress(event.target.value)}
                             placeholder="Город, улица, номер дома"/></Field></SubmitForm></Modal>; // Не предоставляем поле смены владельца.
} // Завершаем редактор объекта.
