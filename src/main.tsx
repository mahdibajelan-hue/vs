import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { RootApp } from './RootApp.tsx'
import { UpdateNotice } from './components/common/UpdateNotice'
import { installLiveRefresh } from './lib/liveRefresh'

installLiveRefresh()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
    <UpdateNotice />
  </StrictMode>,
)
