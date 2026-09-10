import { createRoot } from 'react-dom/client';

import { EditorWorkspace } from './App';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('找不到 #root 挂载节点，请检查 index.html。');
}

createRoot(container).render(<EditorWorkspace />);
