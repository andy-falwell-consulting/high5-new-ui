// Shared cache config for RCD_app — used by CCS, CCSKanban, and App prefetch
export const RCD_LAYOUT = 'RCD_app'
export const RCD_CACHE_VERSION = 9

export const rcdTwoYearsAgo = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 2)
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`
}

export const RCD_FIND_QUERY = [{ zz__Created_On: `>=${rcdTwoYearsAgo()}` }]
export const RCD_SORT = [{ fieldName: 'zz__Created_On', sortOrder: 'descend' }]

