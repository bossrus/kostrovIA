// Файл содержит переиспользуемый элемент интерфейса Badge.
import { statuses, type Status } from '../../domain'; // Получаем русскую подпись статуса.
export function Badge({ status }: { status: Status }) { // Отображаем статус текстом и цветом.
  return <span className={`badge ${status}`}><i />{statuses[status]}</span>; // Текст сохраняет смысл при нарушении цветового восприятия.
} // Завершаем индикатор статуса.
