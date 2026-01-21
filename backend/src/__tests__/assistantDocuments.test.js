const mockQuery = jest.fn()

jest.mock('../db/supabaseClient', () => ({
  connectDb: jest.fn(async () => ({
    query: mockQuery,
  })),
}))

const {
  upsertAssistantDocumentFromRfqDoc,
  publishAssistantDocument,
} = require('../services/assistantDocumentIndexer')
const { searchDocuments } = require('../services/assistantKnowledgeService')

describe('assistant documents pipeline', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001'
  const rfqId = '11111111-1111-1111-1111-111111111111'
  const doc = {
    id: '22222222-2222-2222-2222-222222222222',
    file_name: 'spec.pdf',
    file_type: 'pdf',
    file_size_bytes: 1234,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('upsertAssistantDocumentFromRfqDoc inserts when none exist', async () => {
    mockQuery
      // select existing
      .mockResolvedValueOnce({ rows: [] })
      // insert returning
      .mockResolvedValueOnce({
        rows: [
          {
            id: '33333333-3333-3333-3333-333333333333',
            source_document_id: doc.id,
            tenant_id: tenantId,
            rfq_id: rfqId,
            source_type: 'rfq',
          },
        ],
      })

    const result = await upsertAssistantDocumentFromRfqDoc({
      tenantId,
      rfqId,
      rfqDocument: doc,
    })

    expect(mockQuery).toHaveBeenCalledTimes(2)
    expect(result.rfq_id).toBe(rfqId)
    expect(result.source_document_id).toBe(doc.id)
  })

  test('publishAssistantDocument updates status', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: '333', status: 'published' }],
    })

    const result = await publishAssistantDocument({
      tenantId,
      sourceType: 'rfq',
      sourceDocumentId: doc.id,
    })

    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('published')
  })

  test('searchDocuments returns simplified rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: '444',
          title: 'spec',
          source_type: 'rfq',
          rfq_id: rfqId,
          text_content: 'Hello world',
          metadata: { fileName: 'spec.pdf' },
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
    })

    const results = await searchDocuments({ tenantId, rfqId, query: 'Hello', limit: 3 })

    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(results[0].title).toBe('spec')
    expect(results[0].snippet).toContain('Hello')
    expect(results[0].rfqId).toBe(rfqId)
  })
})
