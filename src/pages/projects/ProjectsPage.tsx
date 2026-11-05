// Файл реализует отдельный экран ProjectsPage; доступные строки предоставляет база через RLS.
import { useState } from 'react'; // Храним поиск и открытие формы.
import { Link } from 'react-router-dom'; // Открываем карточки объектов.
import { ArrowUpRight, Building2, MapPin, Plus, Search, Clock3, CheckCircle2 } from 'lucide-react'; // Подключаем иконки обзора.
import type { Data } from '../../hooks/useWorkspaceData'; // Получаем только разрешённый снимок.
import { Empty } from '../../components/ui/Empty'; // Отображаем отсутствие объектов.
import { ProjectEditor } from '../../components/forms/ProjectEditor'; // Открываем создание стройки.
export function ProjectsPage({data}: { data: Data }) { // Показываем собственные стройки и объекты с назначенными задачами.
    const [search, setSearch] = useState('');
    const [create, setCreate] = useState(false); // Управляем поиском и формой создания.
    const query = search.toLocaleLowerCase('ru').trim();
    const projects = data.projects.filter(project => `${project.name} ${project.address}`.toLocaleLowerCase('ru').includes(query)); // Ищем по названию и адресу.
    const active = data.tasks.filter(task => ['in_progress', 'rework'].includes(task.status)).length;
    const review = data.tasks.filter(task => task.status === 'in_review').length; // Считаем только видимые задачи.
    return <>
        <div className="page-heading">
            <div><p className="eyebrow">ОБЗОР РАБОТЫ</p><h1>Объекты<span
                className="heading-count">{data.projects.length}</span></h1><p>Стройки, задачи и прогресс вашей
                команды.</p></div>
            {data.me.is_manager &&
                <button className="button primary" onClick={() => setCreate(true)}><Plus size={18}/>Новый объект
                </button>}</div>
        <div className="stats">
            <div>
                <span>Доступно объектов</span><strong>{data.projects.length.toString().padStart(2, '0')}</strong><Building2/>
            </div>
            <div>
                <span>Задач в работе и на доработке</span><strong>{active.toString().padStart(2, '0')}</strong><Clock3/>
            </div>
            <div><span>Ожидают проверки</span><strong>{review.toString().padStart(2, '0')}</strong><CheckCircle2/></div>
        </div>
        <div className="section-bar"><h2>Все объекты</h2><label className="search"><Search size={17}/><input
            aria-label="Поиск объектов" placeholder="Найти объект или адрес…" value={search}
            onChange={event => setSearch(event.target.value)}/></label></div>
        {projects.length ? <div className="project-grid">{projects.map((project, index) => {
            const tasks = data.tasks.filter(task => task.project_id === project.id);
            const accepted = tasks.filter(task => task.status === 'accepted').length;
            return <Link to={`/projects/${project.id}`} className="project-card" key={project.id}>
                <div className="project-card-top"><span className="project-icon"><Building2 size={24}/></span><span
                    className="object-index">ОБЪЕКТ {String(index + 1).padStart(2, '0')}</span><ArrowUpRight size={20}/>
                </div>
                <h3>{project.name}</h3><p className="address"><MapPin size={15}/>{project.address}</p>
                <div className="project-progress">
                    <div><span>Принято задач</span><strong>{accepted} / {tasks.length}</strong></div>
                    <progress aria-label={`Принято задач: ${accepted} из ${tasks.length}`} value={accepted}
                              max={tasks.length || 1}/>
                </div>
                <div className="project-card-bottom">
                    <span>{project.owner_id === data.me.id ? 'Мой объект' : 'Назначен как исполнитель'}</span><span>{tasks.length} задач</span>
                </div>
            </Link>;
        })}</div> : <Empty title={query ? 'Ничего не найдено' : 'Пока нет объектов'}
                           text={query ? 'Попробуйте другое название или адрес.' : data.me.is_manager ? 'Создайте первый объект и назначьте команде задачи.' : 'Объекты появятся, когда вам назначат задачи.'}/>}{create &&
        <ProjectEditor data={data} close={() => setCreate(false)}/>}</>; // Карточки исполнителя учитывают только его задачи.
} // Завершаем обзор объектов.
