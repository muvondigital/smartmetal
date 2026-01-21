// MUVOS Platform – SmartMetal CPQ is the CPQ layer running on MUVOS
// SmartMetal CPQ Platform
// Developed by Muvon Digital, the innovation arm of Muvon Energy.
// Copyright (c) 2025 Muvon Energy. All rights reserved.
// Proprietary & Confidential — Not for distribution.

import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Router from './router'
import { Toaster } from './components/ui/sonner'
import BRANDING from './config/branding'

function AppContent() {
  // Set default document title from MUVOS branding config
  document.title = BRANDING.APP_TITLE;
  return <Router />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App



