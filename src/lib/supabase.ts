// Файл создаёт единственный клиент Supabase; во фронтенде разрешён исключительно публичный ключ.
import {createClient} from '@supabase/supabase-js'; // Используем официальный SDK.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined; // Читаем адрес из локальной конфигурации Vite.
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined; // Читаем publishable либо legacy anon key.
export const configured = Boolean(url && key && key !== 'replace_with_publishable_key'); // Позволяем показать понятную ошибку настройки.
export const supabase = configured ? createClient(url!, key!, {auth: {detectSessionInUrl: false}}) : null; // SDK хранит сессию и обновляет токен.
export function db() { // Возвращаем настроенный клиент с проверкой на этапе выполнения.
    if (!supabase) throw new Error('Укажите VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local'); // Не маскируем отсутствие конфигурации.
    return supabase; // Не используем service_role ни в одном браузерном запросе.
} // Завершаем получение клиента.
export function fail(error: { message: string; code?: string } | null) { // Преобразуем ответы SDK в обычные исключения.
    if (error) throw new Error(error.code === '23514' && error.message.includes('check constraint') ? 'Проверьте длину и заполнение полей.' : error.message); // Сохраняем полезные серверные сообщения.
} // Завершаем обработку ошибок.
