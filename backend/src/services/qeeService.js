const materialsService = require('./materialsService')
const { connectDb } = require('../db/supabaseClient')

const DISCLAIMER =
  'This is a non-binding advisory estimate based on the catalog baseline price. Run a pricing workflow to generate a formal quote.'

let checkedTenantColumn = false
let materialsHasTenantColumn = false

async function ensureTenantColumnCheck() {
  if (checkedTenantColumn) return materialsHasTenantColumn

  try {
    const db = await connectDb()
    const result = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'materials' AND column_name = 'tenant_id' LIMIT 1`
    )
    materialsHasTenantColumn = result.rows && result.rows.length > 0
  } catch (error) {
    // Fall back to tenant validation on returned rows if column check fails
    materialsHasTenantColumn = false
  } finally {
    checkedTenantColumn = true
  }

  return materialsHasTenantColumn
}

function wrapInternalError(error) {
  return {
    code: 'QEE_INTERNAL_ERROR',
    message: 'Quick Estimate Engine encountered an internal error.',
    details: {
      message: error?.message,
    },
  }
}

async function findMaterialForEstimate({ tenantId, searchTerm, materialId, filters = {} }) {
  if (!tenantId) {
    throw { code: 'TENANT_REQUIRED', message: 'tenantId is required for quick estimate.' }
  }

  try {
    const hasTenantColumn = await ensureTenantColumnCheck()

    if (materialId) {
      if (hasTenantColumn) {
        const db = await connectDb()
        const result = await db.query(
          `SELECT * FROM materials WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
          [materialId, tenantId]
        )
        if (!result.rows || result.rows.length === 0) {
          throw { code: 'MATERIAL_NOT_FOUND', message: 'Material not found for this tenant.' }
        }
        return result.rows[0]
      }

      const material = await materialsService.getMaterialById(materialId, tenantId)
      if (!material) {
        throw { code: 'MATERIAL_NOT_FOUND', message: 'Material not found for this tenant.' }
      }
      return material
    }

    if (!searchTerm || typeof searchTerm !== 'string') {
      throw { code: 'NO_MATCH', message: 'No materials match the search term.' }
    }

    const db = await connectDb()
    const params = []
    let query = `SELECT * FROM materials WHERE `

    if (hasTenantColumn) {
      params.push(tenantId)
      query += `tenant_id = $${params.length} AND (`
    } else {
      query += '('
    }

    params.push(`%${searchTerm}%`)
    const termParam = `$${params.length}`
    query += [
      `material_code ILIKE ${termParam}`,
      `category ILIKE ${termParam}`,
      `grade ILIKE ${termParam}`,
      `spec_standard ILIKE ${termParam}`,
      `material_type ILIKE ${termParam}`,
      `size_description ILIKE ${termParam}`,
    ].join(' OR ')
    query += `) ORDER BY material_code LIMIT 10`

    const result = await db.query(query, params)
    let matches = result.rows || []

    const normalize = (value) => (value || '').toString().toLowerCase()
    if (filters.size) {
      const sizeFilter = normalize(filters.size)
      matches = matches.filter((m) =>
        normalize(m.size || m.size_description).includes(sizeFilter)
      )
    }
    if (filters.schedule) {
      const scheduleFilter = normalize(filters.schedule)
      matches = matches.filter((m) => normalize(m.schedule || '').includes(scheduleFilter))
    }
    if (filters.grade) {
      const gradeFilter = normalize(filters.grade)
      matches = matches.filter((m) => normalize(m.grade || '').includes(gradeFilter))
    }

    // Enforce tenant match if column exists on row
    matches = matches.filter((m) => !m.tenant_id || m.tenant_id === tenantId)

    if (matches.length === 0) {
      throw { code: 'NO_MATCH', message: 'No materials match the search term.' }
    }

    if (matches.length === 1) {
      return matches[0]
    }

    const shortlist = matches.slice(0, 5).map((m) => ({
      id: m.id,
      material_code: m.material_code,
      description: m.description || m.size_description || null,
      category: m.category,
      grade: m.grade,
      size: m.size || m.size_description || null,
    }))

    throw {
      code: 'MULTIPLE_MATCHES',
      message: 'Multiple materials match this search term. Please narrow your query.',
      matches: shortlist,
    }
  } catch (error) {
    if (error && error.code) {
      throw error
    }
    throw wrapInternalError(error)
  }
}

function getBaselinePrice(material) {
  const price = material?.unit_price ?? material?.base_cost
  if (price === null || price === undefined || Number.isNaN(Number(price))) {
    throw {
      code: 'NO_BASELINE_PRICE',
      message: 'This material does not have a baseline price configured in the catalog.',
    }
  }
  return Number(price)
}

function calculateQuickEstimate({ baselinePrice, markupPercent, quantity }) {
  const numericBaseline = Number(baselinePrice)
  let numericMarkup =
    markupPercent !== null && markupPercent !== undefined
      ? Number(markupPercent)
      : 20

  if (!Number.isFinite(numericBaseline) || numericBaseline <= 0) {
    throw {
      code: 'INVALID_BASELINE',
      message: 'Baseline price must be a positive number.',
    }
  }

  if (!Number.isFinite(numericMarkup)) {
    numericMarkup = 20
  }

  const factor = 1 + numericMarkup / 100
  const estimatedUnitPrice = numericBaseline * factor

  let estimatedTotal = null
  let numericQty = null
  if (quantity !== null && quantity !== undefined) {
    numericQty = Number(quantity)
    if (!Number.isFinite(numericQty) || numericQty <= 0) {
      throw {
        code: 'INVALID_QUANTITY',
        message: 'Quantity must be a positive number.',
      }
    }
    estimatedTotal = estimatedUnitPrice * numericQty
  }

  return {
    baselinePrice: numericBaseline,
    markupPercent: numericMarkup,
    estimatedUnitPrice,
    estimatedTotal,
    quantity: numericQty ?? null,
  }
}

function buildEstimateResult({ material, baselinePrice, markupPercent, quantity }) {
  const estimate = calculateQuickEstimate({ baselinePrice, markupPercent, quantity })

  return {
    material: {
      id: material.id,
      material_code: material.material_code,
      description: material.description || material.size_description || null,
      category: material.category,
      size: material.size || material.size_description || null,
      schedule: material.schedule || null,
      grade: material.grade || null,
    },
    baselinePrice: estimate.baselinePrice,
    markupPercent: estimate.markupPercent,
    estimatedUnitPrice: estimate.estimatedUnitPrice,
    quantity: estimate.quantity,
    estimatedTotal: estimate.estimatedTotal,
    currency: material.currency || null,
    disclaimer: DISCLAIMER,
  }
}

async function quickEstimate({
  tenantId,
  searchTerm,
  materialId,
  markupPercent,
  quantity,
  filters,
}) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw { code: 'TENANT_REQUIRED', message: 'tenantId is required for quick estimate.' }
  }

  const material = await findMaterialForEstimate({ tenantId, searchTerm, materialId, filters })
  const baselinePrice = getBaselinePrice(material)
  return buildEstimateResult({ material, baselinePrice, markupPercent, quantity })
}

module.exports = {
  findMaterialForEstimate,
  getBaselinePrice,
  calculateQuickEstimate,
  buildEstimateResult,
  quickEstimate,
}

