// MUVOS Platform – SmartMetal is the CPQ layer running on MUVOS
// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// Developed by Muvon Digital, the innovation arm of Muvon Energy.
// Copyright (c) 2025 Muvon Energy. All rights reserved.
// Proprietary & Confidential — Not for distribution.

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import BRANDING from './config/branding'

// Set document title from branding config
document.title = BRANDING.APP_TITLE

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)



