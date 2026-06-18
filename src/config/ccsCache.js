// Shared cache config for RCD_app — used by CCS, CCSKanban, and App prefetch
export const RCD_LAYOUT = 'RCD_app'
export const RCD_CACHE_VERSION = 5

export const rcdTwoYearsAgo = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 2)
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`
}

export const RCD_FIND_QUERY = [{ zz__Created_On: `>=${rcdTwoYearsAgo()}` }]

export const rcdSlim = r => ({
  recordId: r.recordId,
  fieldData: {
    zz__Display_Organization__ct: r.fieldData.zz__Display_Organization__ct,
    zz__Display_Contact__ct:      r.fieldData.zz__Display_Contact__ct,
    Status:                        r.fieldData.Status,
    kanban_status:                 r.fieldData.kanban_status,
    add_to_kanban:                 r.fieldData.add_to_kanban,
    'Type of Project':             r.fieldData['Type of Project'],
    'rcd start date':              r.fieldData['rcd start date'],
    'Work Order':                  r.fieldData['Work Order'],
    'Lead Builder':                r.fieldData['Lead Builder'],
    Builder1:                      r.fieldData.Builder1,
    Builder2:                      r.fieldData.Builder2,
    Builder3:                      r.fieldData.Builder3,
    zz__Created_On:                r.fieldData.zz__Created_On,
    zz__Modified_On:               r.fieldData.zz__Modified_On,
  },
})
