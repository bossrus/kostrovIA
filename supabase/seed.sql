/* Файл назначает роли четырём предварительно созданным вручную demo-аккаунтам; паролей в репозитории нет. */
begin; /* Применяем профили атомарно. */
do $$ begin /* Проверяем наличие всех требуемых Auth-аккаунтов. */
  if (select count(*) from auth.users where email in ('manager@kostrov.demo', 'executor1@kostrov.demo', 'executor2@kostrov.demo', 'mixed@kostrov.demo')) <> 4 then raise exception 'Сначала создайте четыре demo-аккаунта в Authentication → Users'; end if; /* Не допускаем частично настроенной демонстрации. */
end $$; /* Завершаем предварительную проверку. */
insert into public.profiles(id, display_name, is_manager, is_executor) /* Роли меняет только администратор через SQL. */
select id, case email when 'manager@kostrov.demo' then 'Алексей Костров' when 'executor1@kostrov.demo' then 'Иван Петров' when 'executor2@kostrov.demo' then 'Мария Соколова' else 'Дмитрий Орлов' end, email in ('manager@kostrov.demo', 'mixed@kostrov.demo'), email in ('executor1@kostrov.demo', 'executor2@kostrov.demo') /* Два постановщика и два исполнителя; mixed — исторический логин второго постановщика. */
from auth.users where email in ('manager@kostrov.demo', 'executor1@kostrov.demo', 'executor2@kostrov.demo', 'mixed@kostrov.demo') /* Не затрагиваем остальных пользователей проекта. */
on conflict (id) do nothing; /* Повторный запуск не перезаписывает назначенные администратором роли. */
commit; /* Фиксируем профили; объекты и задачи создаёт demo-seed через обычный пользовательский API. */
