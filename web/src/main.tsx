import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/*
      `basename` = valeur de --base passée à `vite build` (import.meta.env.BASE_URL,
      "/" par défaut). Embarqué dans le panel, l'addon est servi sous
      /addon-proxy/reseller/ : sans basename, <Routes> ne matche rien (page blanche).
    */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
