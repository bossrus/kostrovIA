// Файл содержит отдельный компонент SubmitForm; сервер повторно проверяет каждую операцию.
import { useState, type ReactNode, type FormEvent } from 'react'; // Управляем отправкой, ошибкой и блокировкой полей.
export function SubmitForm({children, submit, label = 'Сохранить', danger = false}: {
    children: ReactNode;
    submit: () => Promise<void>;
    label?: string;
    danger?: boolean
}) { // Повторно используем обработку отправки и ошибок.
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(''); // Блокируем повторный запрос до ответа.
    async function send(event: FormEvent) { // Обрабатываем нативную отправку формы.
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(''); // Не перезагружаем страницу и не дублируем запрос.
        try {
            await submit();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Не удалось сохранить');
        } finally {
            setBusy(false);
        } // Оставляем поля открытыми при серверном отказе.
    } // Завершаем обработчик.
    return <form onSubmit={send}>
        <fieldset disabled={busy}>{children}</fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-footer">
            <button className={danger ? 'button danger' : 'button primary'}
                    disabled={busy}>{busy ? 'Сохраняем…' : label}</button>
        </div>
    </form>; // Нативная валидация required/maxLength работает перед submit.
} // Завершаем общую форму.
