import { BrowserRouter } from 'react-router-dom'
import Router from './router'
import { Toaster } from 'sonner'

// TODO: Integrate AuthProvider from web app when implementing authentication
// For now, authentication will be handled at the route level
function App() {
  return (
    <BrowserRouter>
      <Router />
      <Toaster />
    </BrowserRouter>
  )
}

export default App

