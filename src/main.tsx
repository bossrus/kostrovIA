// Файл запускает React, маршрутизацию и глобальное оформление приложения.
import React from 'react'; // Подключаем StrictMode для проверки побочных эффектов.
import ReactDOM from 'react-dom/client'; // Подключаем браузерный renderer React.
import {HashRouter} from 'react-router-dom'; // Хеш-маршруты работают на любом статическом хостинге без rewrite.
import {App} from './App'; // Подключаем авторизацию и экраны CRM.
import './styles.css'; // Подключаем адаптивное оформление.
ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><HashRouter><App/></HashRouter></React.StrictMode>); // Монтируем приложение в HTML-оболочку.
