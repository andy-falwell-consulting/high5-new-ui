// Dropdown option lists for the Products & Services module, mirrored from the
// FileMaker value lists on the `Products & Services_New` layout (the source of
// truth). Shared by the create modal (NewItemModal) and the detail view
// (ProductsAndServicesV2) so the two never drift. If a value list changes in
// FileMaker, update it here.
//
// QBO_INCOME / QBO_CLASS store the QuickBooks id as the value; the label is the
// human name shown in FileMaker. SKUs and these ids are TEXT — never coerce.

export const TYPES = ['Product', 'Service'];

export const CATEGORIES = [
  'Catalog', 'EOL', 'Hardware', 'High Element', 'Labor', 'Low Element',
  'Lumber', 'Repair', 'Tool', 'Training', 'Typical Component',
];

export const VENDORS = [
  'Allied Bolt', 'AtHeight', 'Atomik Climbing', 'Edelrid', 'Fusion Climb',
  'High 5', 'Liberty Mountain', 'Lavalley Building Supply, Perkins',
  'Lotus Graphics', 'Peak', 'Petzl', 'Printful', 'S&S', 'Shamrock Power',
  'Sticker Mule',
];

// QuickBooks income accounts (value = QBO account id, label = account name).
export const QBO_INCOME = [
  { label: '4010 - Open Enrollment', value: '151' },
  { label: '4020 - Custom training', value: '177' },
  { label: '4021 - Adult Custom Direct Service', value: '112' },
  { label: '4022 - Corporate Programs', value: '116' },
  { label: '4023 - College Programs', value: '117' },
  { label: '4024 - Youth Programs', value: '118' },
  { label: '4030 - Graduate Credit', value: '149' },
  { label: '4050 - Program Review', value: '137' },
  { label: '4060 - Scholarship Award', value: '286' },
  { label: '4065 - Planning - Custom', value: '329' },
  { label: '4111 - EOL Youth Custom Programming', value: '1150040008' },
  { label: '4112 - EOL Summer Program', value: '1150040009' },
  { label: '4121 - EOL Adult Programming', value: '353' },
  { label: '4122 - EOL Adult Open Enrollment', value: '1150040006' },
  { label: '4130 - EOL Keene (C&S)', value: '195' },
  { label: '4210 - Low or High Elements (new installations)', value: '244' },
  { label: '4230 - Inspection Services', value: '303' },
  { label: '4240 - Repairs', value: '268' },
  { label: '4270 - Site Planning/Consulting', value: '287' },
  { label: '4410 - Store / Catalog Sales', value: '155' },
  { label: '4430 - Manuals and Miscellaneous Items', value: '156' },
];

// QuickBooks class / CAT (value = QBO class id, label = class name).
export const QBO_CLASS = [
  { label: 'CAT',  value: '1300000000000836523' },
  { label: 'CCS',  value: '1300000000000836514' },
  { label: 'DEV',  value: '1300000000000836526' },
  { label: 'EOL',  value: '1300000000000836525' },
  { label: 'EP',   value: '1300000000000836530' },
  { label: 'OE',   value: '1300000000000836522' },
  { label: 'OV',   value: '1300000000000836516' },
  { label: 'T&TD', value: '1300000000000836520' },
];
