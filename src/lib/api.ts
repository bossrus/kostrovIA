// Файл централизует вызовы RPC и преобразует серверный отказ в исключение.
import {db, fail} from './supabase'; // Получаем клиент и общую обработку ошибок.
export async function rpc(name: string, args: Record<string, unknown>) { // Централизуем вызовы закрытых операций базы.
    const result = await db().rpc(name, args);
    fail(result.error);
    return result.data; // Возвращаем результат только после проверки серверной ошибки.
} // Завершаем обёртку RPC.
