// Файл настраивает Vite и преобразование React; запросы идут напрямую в Supabase.
import { defineConfig } from 'vite'; // Импортируем типизированную фабрику конфигурации.
import react from '@vitejs/plugin-react'; // Подключаем поддержку React и Fast Refresh.
export default defineConfig({ plugins: [react()], build: { rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom', 'react-router-dom'] } } } } }); // Отделяем SDK и React для независимого кеширования небольших частей сборки.
