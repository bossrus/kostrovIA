// Файл содержит переиспользуемый элемент интерфейса Field.
import type { ReactNode } from 'react'; // Принимаем вложенное поле ввода.
export function Field({ label, children }: { label: string; children: ReactNode }) { // Объединяем подпись и вложенное поле.
  return <label className="field"><span>{label}</span>{children}</label>; // Вложенный input автоматически связан с подписью.
} // Завершаем обёртку поля.
