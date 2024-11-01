import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes,Route } from 'react-router-dom'
import './index.css';
import App from './App.tsx'
import Error404 from './errors/error-404.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
     <Router>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="*" element={<Error404 />} />
        </Routes>
    </Router>
  </StrictMode>,
)
