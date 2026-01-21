import { Link, useLocation } from 'react-router-dom'
import BRANDING from '../config/branding'

export default function Navbar() {
  const location = useLocation()

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="text-xl font-bold text-gray-900">
            {BRANDING.PRODUCT_WITH_PLATFORM}
          </Link>
          <div className="flex space-x-4">
            <Link
              to="/"
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                location.pathname === '/'
                  ? 'text-gray-900 bg-gray-100'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Commercial Requests
            </Link>
            <Link
              to="/rfqs/import"
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                location.pathname === '/rfqs/import'
                  ? 'text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Import a document (RFQ, RFP, MTO, BOM) using AI"
            >
              Import Document
            </Link>
            <Link
              to="/rfqs/new"
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
              title="Create a request manually without uploading a document"
            >
              Create Commercial Request
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}



