// Файл восстанавливает сессию Supabase и выбирает страницу входа либо рабочую оболочку.
import {useEffect, useState} from 'react'; // Отслеживаем авторизованного пользователя.
import type {Session} from '@supabase/supabase-js'; // Типизируем сессию.
import {configured, supabase} from './lib/supabase'; // Получаем публичный клиент Auth.
import {LoginPage} from './pages/auth/LoginPage'; // Подключаем отдельную страницу входа.
import {Workspace} from './components/layout/Workspace'; // Подключаем авторизованное пространство.
export function App() { // Выбираем экран входа либо авторизованную оболочку.
    const [session, setSession] = useState<Session | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState(''); // Различаем неизвестную сессию и отсутствие входа.
    useEffect(() => { // Подписываемся на вход, выход и обновление токена.
        if (!supabase) {
            setReady(true);
            return;
        } // Позволяем показать ошибку окружения без падения.
        let alive = true;
        let changed = false; // Защищаемся от гонки восстановления и нового события Auth.
        const {data} = supabase.auth.onAuthStateChange((_event, value) => {
            changed = true;
            if (alive) {
                setSession(value);
                setReady(true);
            }
        }); // Не выполняем вложенные запросы внутри callback Auth.
        void supabase.auth.getSession().then(result => {
            if (alive && !changed) {
                setSession(result.data.session);
                setError(result.error?.message ?? '');
                setReady(true);
            }
        }).catch(() => {
            if (alive) {
                setError('Не удалось восстановить сессию. Обновите страницу.');
                setReady(true);
            }
        }); // Восстанавливаем сохранённый вход.
        return () => {
            alive = false;
            data.subscription.unsubscribe();
        }; // Убираем подписку при размонтировании.
    }, []); // Подключаем Auth один раз на экземпляр приложения.
    if (!ready) return <div className="boot">Загружаем рабочее пространство…</div>; // Не показываем форму до проверки сессии.
    if (!configured) return <div className="boot"><h1>Нужна настройка Supabase</h1><p>Скопируйте .env.example в
        .env.local и добавьте публичный ключ проекта.</p></div>; // Объясняем ошибку запуска.
    return session ? <Workspace key={session.user.id} session={session}/> : <LoginPage initialError={error}/>; // Отдельный key исключает показ данных предыдущего пользователя.
} // Завершаем корневой компонент.
