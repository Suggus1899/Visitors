import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@logmaster/ui/index.css';
import { QueryProvider } from '@logmaster/auth';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryProvider>
            <App />
        </QueryProvider>
    </React.StrictMode>,
);
