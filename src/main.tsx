import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// 开发模式下更清晰的 Vite HMR 错误输出
if (import.meta.hot?.on) {
  import.meta.hot.on('vite:error', (error: { err?: { message?: string; frame?: string } }) => {
    if (error.err) {
      console.error(
        [error.err.message, error.err.frame].filter(Boolean).join('\n'),
      )
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
