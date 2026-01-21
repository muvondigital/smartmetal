import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { createRfq } from '../api/client'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Alert, AlertDescription } from '../components/ui/alert'
import {
  Upload,
  FileSearch,
  ArrowLeft,
  Paperclip,
  File,
  X,
  TrendingUp,
  Package,
  DollarSign,
} from 'lucide-react'

interface CustomerData {
  name: string
  contactPerson?: string
  email?: string
  phone?: string
  activeAgreements: number
  winRate: number
  lastMargin: number
  notes?: string
}

interface Attachment {
  id: string
  name: string
  size: number
  file: File
}

// TODO: Replace with actual customer API call
const MOCK_CUSTOMERS = [
  'Acme Manufacturing Corp.',
  'Global Industrial Solutions',
  'TechFlow Industries',
  'Pacific Steel Works',
  'Metro Engineering Group',
  'Atlantic Chemical Supplies',
  'Eastern Pipe Systems',
]

export default function RfqCreate() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const customerDropdownRef = useRef<HTMLDivElement>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [customerName, setCustomerName] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [customerData, setCustomerData] = useState<CustomerData | null>(null)
  const [contactPerson, setContactPerson] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')

  const [rfqTitle, setRfqTitle] = useState('')
  const [customerRfqNumber, setCustomerRfqNumber] = useState('')
  const [deliveryLocation, setDeliveryLocation] = useState('')
  const [incoterms, setIncoterms] = useState('EXW')
  const [paymentTerms, setPaymentTerms] = useState('NET30')
  const [quoteValidity, setQuoteValidity] = useState('30')
  const [urgency, setUrgency] = useState<'Low' | 'Medium' | 'High'>('Medium')
  const [projectType, setProjectType] = useState<'standard' | 'rush' | 'ltpa' | 'spot' | ''>('')

  const [attachments, setAttachments] = useState<Attachment[]>([])

  // Filter customers based on search
  const filteredCustomers = MOCK_CUSTOMERS.filter((customer) =>
    customer.toLowerCase().includes(customerSearch.toLowerCase())
  )

  // Load customer data when selected (TODO: Replace with API call)
  useEffect(() => {
    if (customerName) {
      // Mock customer data - TODO: Replace with actual API call to fetch customer details
      setCustomerData({
        name: customerName,
        activeAgreements: Math.floor(Math.random() * 5) + 1,
        winRate: Math.floor(Math.random() * 40) + 45, // 45-85%
        lastMargin: Math.floor(Math.random() * 20) + 15, // 15-35%
      })
    } else {
      setCustomerData(null)
    }
  }, [customerName])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest('input#customer')
      ) {
        setShowCustomerDropdown(false)
      }
    }

    if (showCustomerDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCustomerDropdown])

  const handleCustomerSelect = (customer: string) => {
    setCustomerName(customer)
    setCustomerSearch(customer)
    setShowCustomerDropdown(false)
    setError(null)
  }

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return

    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      file,
    }))

    setAttachments((prev) => [...prev, ...newAttachments])
  }

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id))
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      handleFileSelect(e.dataTransfer.files)
    },
    []
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (!customerName.trim()) {
      setError('Please select a customer')
      return
    }

    setIsSubmitting(true)
    try {
      // TODO: Extend API to accept all fields
      const rfq = await createRfq({
        customer_name: customerName.trim(),
        // TODO: Include additional fields once backend supports them:
        // title: rfqTitle,
        // customer_rfq_number: customerRfqNumber,
        // contact_person: contactPerson,
        // contact_email: contactEmail,
        // contact_phone: contactPhone,
        // delivery_location: deliveryLocation,
        // incoterms,
        // payment_terms: paymentTerms,
        // quote_validity: quoteValidity,
        // urgency,
        // notes: customerNotes,
        project_type: projectType || undefined,
      })

      // TODO: Upload attachments if any
      // if (attachments.length > 0) {
      //   await uploadRfqAttachments(rfq.id, attachments)
      // }

      navigate(`/rfqs/${rfq.id}`)
    } catch (err) {
      console.error('Failed to create RFQ:', err)
      setError(err instanceof Error ? err.message : 'Failed to create commercial request. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    navigate('/rfqs')
  }

  const isFormValid = customerName.trim().length > 0

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">
        {/* Header Section */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Link to="/rfqs">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Create Commercial Request</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Create a new commercial request manually. Or <Link to="/rfqs/import" className="text-blue-600 hover:underline">import a document</Link> to extract line items automatically.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => navigate('/rfqs/import')}
            >
              <Upload className="h-4 w-4" />
              Import Document
            </Button>
            <Button variant="outline" className="gap-2">
              <FileSearch className="h-4 w-4" />
              Import Previous Request
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? 'Creating...' : 'Create Request'}
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Three-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* COLUMN 1 - Customer & Agreements Panel */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer Information</CardTitle>
                <CardDescription>Select and manage customer details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Customer Select/Autocomplete */}
                <div className="space-y-2">
                  <Label htmlFor="customer">
                    Customer <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="customer"
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value)
                        setShowCustomerDropdown(true)
                        if (!e.target.value) {
                          setCustomerName('')
                          setCustomerData(null)
                        }
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      placeholder="Search or type customer name..."
                      className="pr-10"
                    />
                    {showCustomerDropdown && filteredCustomers.length > 0 && customerSearch && (
                      <div
                        ref={customerDropdownRef}
                        className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto"
                      >
                        {filteredCustomers.map((customer) => (
                          <button
                            key={customer}
                            type="button"
                            onClick={() => handleCustomerSelect(customer)}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                          >
                            {customer}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Customer Stats Badges */}
                {customerData && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Badge variant="secondary" className="gap-1">
                      <Package className="h-3 w-3" />
                      {customerData.activeAgreements} Active Agreements
                    </Badge>
                    <Badge variant="secondary" className="gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {customerData.winRate}% Win Rate
                    </Badge>
                    <Badge variant="secondary" className="gap-1">
                      <DollarSign className="h-3 w-3" />
                      {customerData.lastMargin}% Last Margin
                    </Badge>
                  </div>
                )}

                <Separator />

                {/* Contact Fields */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contactPerson">Contact Person</Label>
                    <Input
                      id="contactPerson"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      placeholder="Full name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">Email</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactPhone">Phone</Label>
                    <Input
                      id="contactPhone"
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Customer Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Customer Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder="Add notes about this customer..."
                  className="min-h-[120px] resize-none"
                />
              </CardContent>
            </Card>
          </div>

          {/* COLUMN 2 - RFQ Details Panel */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Request Details</CardTitle>
                <CardDescription>Configure commercial request parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rfqTitle">
                    Request Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="rfqTitle"
                    value={rfqTitle}
                    onChange={(e) => setRfqTitle(e.target.value)}
                    placeholder="e.g., Q1 2024 Pipe Supply Contract"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customerRfqNumber">Customer Request Number</Label>
                  <Input
                    id="customerRfqNumber"
                    value={customerRfqNumber}
                    onChange={(e) => setCustomerRfqNumber(e.target.value)}
                    placeholder="Optional reference number"
                  />
                </div>

                <Separator />

                {/* Delivery Terms Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-900">Delivery Terms</h3>
                  <div className="space-y-2">
                    <Label htmlFor="deliveryLocation">Delivery Location</Label>
                    <Input
                      id="deliveryLocation"
                      value={deliveryLocation}
                      onChange={(e) => setDeliveryLocation(e.target.value)}
                      placeholder="City, Country"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="incoterms">Incoterms</Label>
                    <select
                      id="incoterms"
                      value={incoterms}
                      onChange={(e) => setIncoterms(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="EXW">EXW - Ex Works</option>
                      <option value="FOB">FOB - Free On Board</option>
                      <option value="CIF">CIF - Cost, Insurance and Freight</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentTerms">Payment Terms</Label>
                    <select
                      id="paymentTerms"
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="NET15">NET 15</option>
                      <option value="NET30">NET 30</option>
                      <option value="NET45">NET 45</option>
                      <option value="NET60">NET 60</option>
                      <option value="COD">COD - Cash on Delivery</option>
                      <option value="PREPAID">Prepaid</option>
                    </select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="quoteValidity">Quote Validity</Label>
                  <select
                    id="quoteValidity"
                    value={quoteValidity}
                    onChange={(e) => setQuoteValidity(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                    <option value="90">90 days</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="projectType">Project Type</Label>
                  <select
                    id="projectType"
                    value={projectType}
                    onChange={(e) => setProjectType(e.target.value as 'standard' | 'rush' | 'ltpa' | 'spot' | '')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select Project Type</option>
                    <option value="standard">Standard</option>
                    <option value="rush">Rush</option>
                    <option value="ltpa">LTPA (Long-Term Purchase Agreement)</option>
                    <option value="spot">Spot</option>
                  </select>
                  {projectType && (
                    <p className="text-xs text-slate-500 mt-1">
                      {projectType === 'rush' && 'Rush projects may prefer China origin for faster delivery'}
                      {projectType === 'ltpa' && 'LTPA projects prefer Non-China origin for long-term stability'}
                      {projectType === 'standard' && 'Standard project with flexible origin options'}
                      {projectType === 'spot' && 'Spot purchase with standard pricing rules'}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="urgency">Urgency</Label>
                  <select
                    id="urgency"
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value as 'Low' | 'Medium' | 'High')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                  {urgency === 'High' && (
                    <Badge variant="destructive" className="mt-1">
                      High Priority
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* COLUMN 3 - Insights + Attachments Panel */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Insights & Attachments</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue="insights" className="w-full">
                  <TabsList className="w-full rounded-none border-b">
                    <TabsTrigger value="insights" className="flex-1">
                      Insights
                    </TabsTrigger>
                    <TabsTrigger value="attachments" className="flex-1">
                      Attachments
                    </TabsTrigger>
                  </TabsList>

                  {/* Insights Tab */}
                  <TabsContent value="insights" className="p-6 space-y-4 m-0">
                    {customerData ? (
                      <>
                        {/* Win Rate Display */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-700">
                              Win Rate
                            </span>
                            <Badge variant="secondary">{customerData.winRate}%</Badge>
                          </div>
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 transition-all"
                              style={{ width: `${customerData.winRate}%` }}
                            />
                          </div>
                        </div>

                        <Separator />

                        {/* Last Quoted Items - Mock Data */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-slate-900">
                            Last Quoted Items
                          </h4>
                          <div className="space-y-2 text-sm text-slate-600">
                            <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                              <span>ASTM A312 TP316L Pipes</span>
                              <Badge variant="outline" className="text-xs">
                                $2,450
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                              <span>Carbon Steel Flanges</span>
                              <Badge variant="outline" className="text-xs">
                                $890
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                              <span>Stainless Steel Fittings</span>
                              <Badge variant="outline" className="text-xs">
                                $1,200
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <Separator />

                        {/* Frequently Purchased - Mock Data */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-slate-900">
                            Frequently Purchased
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">Pipes</Badge>
                            <Badge variant="outline">Flanges</Badge>
                            <Badge variant="outline">Fittings</Badge>
                            <Badge variant="outline">Valves</Badge>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-slate-500 text-sm">
                        Select a customer to view insights
                      </div>
                    )}
                  </TabsContent>

                  {/* Attachments Tab */}
                  <TabsContent value="attachments" className="p-6 space-y-4 m-0">
                    {/* File Upload Zone */}
                    <div
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-slate-400 transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-700 mb-1">
                        Drop files here or click to upload
                      </p>
                      <p className="text-xs text-slate-500">
                        PDF, DOC, XLS, Images (max 10MB per file)
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files)}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                      />
                    </div>

                    {/* Attachments List */}
                    {attachments.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-slate-900">
                          Attached Files ({attachments.length})
                        </h4>
                        <div className="space-y-2">
                          {attachments.map((attachment) => (
                            <div
                              key={attachment.id}
                              className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200"
                            >
                              <File className="h-4 w-4 text-slate-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">
                                  {attachment.name}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {(attachment.size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleRemoveAttachment(attachment.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
