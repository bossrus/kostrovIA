// Файл показывает единое состояние для удалённой или недоступной записи без раскрытия чужих данных.
import { Link } from 'react-router-dom'; // Возвращаемся к списку объектов.
import { ArrowLeft } from 'lucide-react'; // Обозначаем возврат.
import { Empty } from '../ui/Empty'; // Используем общее пустое состояние.
export function NotAvailable() {
    return <><Link className="back" to="/projects"><ArrowLeft size={16}/>К объектам</Link><Empty
        title="Запись недоступна"
        text="Она удалена или у вас нет доступа. Обновите данные, если назначение изменилось."/></>;
} // Не различаем отсутствие записи и чужой UUID.
