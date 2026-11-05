// Файл содержит переиспользуемый элемент интерфейса Modal.
import { useEffect, useId, useRef, type ReactNode } from 'react'; // Управляем нативным dialog и его подписью.
import { X } from 'lucide-react'; // Обозначаем закрытие окна.
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) { // Создаём доступное нативное модальное окно.
  const dialog = useRef<HTMLDialogElement>(null); const heading = useId(); // Храним DOM-ссылку и уникальную подпись.
  useEffect(() => { const node = dialog.current!; node.showModal(); node.querySelector<HTMLInputElement>('input, textarea, select')?.focus(); return () => node.close(); }, []); // Нативный dialog удерживает фокус и сразу выбирает первое поле.
  return <dialog ref={dialog} aria-labelledby={heading} onCancel={(event) => { event.preventDefault(); close(); }}><div className="modal-head"><h2 id={heading}>{title}</h2><button type="button" className="icon-button" aria-label="Закрыть окно" onClick={close}><X size={20} /></button></div>{children}</dialog>; // Escape закрывает окно через контролируемое состояние.
} // Завершаем модальное окно.
