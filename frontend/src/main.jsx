import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const DATA_REFRESH_EVENT = 'sis:data-refresh'
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

if (!window.__sisAjaxInterceptorInstalled) {
  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input, init = {}) => {
    const response = await originalFetch(input, init)

    try {
      const method = String(
        init?.method || (input instanceof Request ? input.method : 'GET')
      ).toUpperCase()
      const requestUrl = typeof input === 'string' ? input : input?.url || ''
      const isApiRequest = requestUrl.startsWith('/api/') || requestUrl.includes('/api/')

      if (response.ok && isApiRequest && MUTATION_METHODS.has(method)) {
        window.dispatchEvent(new Event(DATA_REFRESH_EVENT))
      }
    } catch (error) {
      console.error('AJAX interceptor error:', error)
    }

    return response
  }

  window.__sisAjaxInterceptorInstalled = true
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
