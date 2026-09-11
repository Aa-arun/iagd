import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

// 挂载点 #root 在 index.html 里。'!' 是 TypeScript 的非空断言：
// 我们确信这个元素存在，不想为此写一层 if。
const container = document.getElementById('root')!;

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
