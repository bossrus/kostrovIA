/* Файл обновляет ранее применённые RPC: конфликт версии возвращает HTTP 409 без автоматического повтора транзакции. */
begin; /* Изменяем функции атомарно. */
do $$ /* Исправляем только три известные операции с контролем версии. */
declare definition text; function_id oid; /* Готовим идентификатор и исходный SQL функции. */
begin /* Начинаем точечное обновление. */
  foreach function_id in array array['public.save_task(uuid,uuid,text,text,uuid,integer)'::regprocedure::oid, 'public.delete_task(uuid,integer)'::regprocedure::oid, 'public.transition_task(uuid,public.task_status,text,integer)'::regprocedure::oid] loop /* Не затрагиваем другие функции проекта. */
    select pg_get_functiondef(function_id) into definition; /* Получаем полное существующее определение с проверками доступа. */
    execute replace(definition, '40001', 'PT409'); /* Сохраняем логику и grants, меняя только код бизнес-конфликта. */
  end loop; /* Завершаем обновление трёх RPC. */
end; /* Завершаем блок обновления. */
$$; /* Закрываем анонимный блок. */
commit; /* Публикуем исправленный ответ на конфликт версии. */
