// client/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { TripProvider } from './contexts/TripContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WebSocketProvider>
      <TripProvider>
        <RouterProvider router={router} />
      </TripProvider>
    </WebSocketProvider>
  </React.StrictMode>
)
