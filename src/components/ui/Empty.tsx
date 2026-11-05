// Файл содержит переиспользуемый элемент интерфейса Empty.
import { FolderOpen } from 'lucide-react'; // Обозначаем отсутствие данных.
export function Empty({ title, text }: { title: string; text: string }) { // Объясняем отсутствие записей.
  return <div className="empty"><FolderOpen size={34} /><h3>{title}</h3><p>{text}</p></div>; // Оставляем пользователю понятный следующий шаг.
} // Завершаем пустое состояние.
