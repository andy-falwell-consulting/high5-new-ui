# High5 DB — Claude Code Guide

React 19 + Vite 8 front-end. FileMaker Data API backend. Single-page app with a nav rail and module panels.

---

## Repository layout

```
src/
  api/filemaker.js          # All FileMaker API calls + cache layer
  hooks/useAllRecords.js    # Hook: fetches + streams a full layout
  config/ccsCache.js        # Constants for the CCS (Course projects) layout
  components/
    ListControls.jsx/.css   # Shared sidebar controls (hook + toolbar + body)
    NavRail.jsx             # Left nav
    App.jsx                 # Root: routing, module mount/hide, cache prewarm
    <Module>.jsx/.css       # One file pair per module
```

---

## Release workflow

1. Bump `package.json` `version` before every commit that goes to `main`.
2. Commit message format: `v1.0.X — short description`
3. After push: `git tag v1.0.X && git push origin v1.0.X`
4. PR title must include the version: `v1.0.X — short description`
5. Branches: `main` = production, `new-ui` = staging/dev. PRs go `new-ui → main`.

---

## Adding a new module

### 1. FileMaker layout name

Layouts follow the pattern `<Name>_New` (e.g. `OELookup_New`, `Contacts_New`).

### 2. Create `src/components/<Module>.jsx` and `<Module>.css`

Use `OELookup.jsx` / `OELookup.css` as the canonical reference. Key points:

```jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { getRecord } from '../api/filemaker'
import { useAllRecords } from '../hooks/useAllRecords'
import ListToolbar, { useListControls, ListBody } from './ListControls'
import './<Module>.css'

const LAYOUT = 'MyLayout_New'
const CACHE_VERSION = 1   // increment when the field set changes

export default function MyModule({ navTarget, onClearNav, onRecordSelect } = {}) {
  const { records, total, loading, error } = useAllRecords(LAYOUT, { cacheVersion: CACHE_VERSION })

  const controls = useListControls({
    records,
    storageKey: 'my-module',          // unique key — drives localStorage sort/order persistence
    name: f => f['Some Name Field'],  // used for A–Z section headers when sort.alpha = true
    searchKeys: ['Field A', 'Field B'],
    chips: [                          // optional filter chips; omit or pass [] for none
      { id: 'active', label: 'Active', match: f => f['Status'] === 'Active' },
    ],
    sorts: [
      { id: 'name', label: 'Name', value: f => f['Some Name Field'] ?? '' },
      { id: 'date', label: 'Date',  value: f => f['Date Field'] ?? '' },
    ],
    defaultSort: 'name',
    defaultOrder: 'asc',   // 'asc' | 'desc'
  })
  // ...
}
```

**`useListControls` API — exact shape (do not guess):**

| Input | Description |
|---|---|
| `records` | Raw array from `useAllRecords` |
| `storageKey` | Unique string; keys localStorage entries |
| `name` | `f => string` where `f` is `r.fieldData` — used for A–Z headers |
| `searchKeys` | `string[]` — fieldData keys to search |
| `chips` | `[{ id, label, match, color? }]` — `match(fieldData) → bool` |
| `sorts` | `[{ id, label, value, alpha? }]` — `value(fieldData) → sortable` |
| `defaultSort` | Must match an id in `sorts` |
| `defaultOrder` | `'asc'` or `'desc'` |
| `fields` | Optional override, default `r => r.fieldData` — leave as default |
| `extraFilter` | Optional `f => bool` for dynamic filtering |

**`useListControls` return — exact shape:**

| Key | Type | Notes |
|---|---|---|
| `processed` | `Record[]` | Filtered + sorted array. Use this for the list. |
| `sections` | `[{letter, items}] \| null` | Populated only when active sort has `alpha: true` |
| `count` | `number` | `processed.length` |
| `total` | `number` | `records.length` (unfiltered) |
| `typed` / `setTyped` | string state | Search input value |
| `filterOpen` / `setFilterOpen` | bool state | |
| `chipId` / `setChipId` | string state | Active chip id, default `'all'` |
| `sortId` / `setSortId` | string state | |
| `order` / `setOrder` | `'asc' \| 'desc'` | |
| `sort` / `sorts` / `chips` | pass-through | |

**Common mistake:** `controls.filtered` does not exist. Always use `controls.processed`.

### 3. Render the sidebar controls

```jsx
{/* Header */}
<ListToolbar c={controls} />           // c= prop, not controls=

{/* Loading skeletons */}
{loading && controls.processed.length === 0 ? (
  <div className="xx-loading">{Array.from({ length: 12 }, (_, i) => <div key={i} className="xx-skeleton" />)}</div>
) : error ? (
  <div className="xx-empty-state"><p>Failed to load records.</p></div>
) : (
  <ListBody c={controls} renderItem={r => (
    <div key={r.recordId}
      className={`xx-list-item ${selected?.recordId === r.recordId ? 'active' : ''}`}
      onClick={() => { handleSelect(r); onRecordSelect?.(r.recordId); }}>
      {/* item content */}
    </div>
  )} />
)}
```

**`ListBody` takes `renderItem`, not children.** Each item must have a unique `key`.

### 4. Record selection pattern

```jsx
const [selected, setSelected] = useState(null)

async function handleSelect(r) {
  setSelected(r)                    // show list-level data immediately
  getRecord(LAYOUT, r.recordId).then(detail => {
    const fresh = detail?.response?.data?.[0]
    if (fresh) setSelected(fresh)   // then refresh with full record
  }).catch(() => {})
}
```

### 5. Deep-link / navTarget

```jsx
useEffect(() => {
  if (!navTarget || navTarget.moduleId !== 'my-module') return
  const rec = controls.processed.find(r => String(r.recordId) === String(navTarget.recordId))
  if (rec) { handleSelect(rec); onClearNav?.(); return }
  let alive = true
  getRecord(LAYOUT, navTarget.recordId).then(d => {
    const r = d?.response?.data?.[0]
    if (alive && r) { handleSelect(r); onClearNav?.(); }
  }).catch(() => {})
  return () => { alive = false }
}, [navTarget])
```

### 6. Register in `App.jsx`

Three places:

```jsx
// 1. Import
import MyModule from './components/MyModule'

// 2. MODULES array (controls nav rail order and grouping)
{ id: 'my-module', label: 'My Module', icon: '◈', group: 'Records' }

// 3. Cache prewarm in the startup useEffect
getAllRecords('MyLayout_New', { cacheVersion: 1, batchSize: 100 }).catch(() => {})

// 4. Render (copy the pattern from adjacent modules)
{visited.has('my-module') && (
  <div style={{ display: activeModule === 'my-module' ? 'contents' : 'none' }}>
    <MyModule navTarget={navTarget} onClearNav={clearNavTarget} onRecordSelect={makeRecordSelectHandler('my-module')} />
  </div>
)}
```

---

## CSS conventions

- Each module gets its own CSS file with a short unique prefix (`oe-`, `ins-`, `cv2-`, etc.).
- Dark theme is the base (hardcoded hex values, no custom properties needed for simple modules).
- Light theme overrides go at the **bottom** of the CSS file:

```css
[data-theme="light"] .xx-container { background: #f8fafc; color: #0f172a; }
[data-theme="light"] .xx-sidebar   { background: #ffffff; border-right-color: #e2e8f0; }
/* ... one rule per element that differs */
```

- Common dark background values: `#0f1117` (main bg), `#13151c` (sidebar/cards), `#1e2130` (borders).
- Common light background values: `#f8fafc` (main bg), `#ffffff` (sidebar/cards), `#e2e8f0` (borders).
- Accent red: `#e8322a`.

---

## FileMaker API

```js
// Stream all records (used by useAllRecords internally)
getAllRecords(layout, { cacheVersion, batchSize, onProgress })

// Fetch a single full record (HIGH priority — preempts batch fetches)
getRecord(layout, recordId)

// Patch one cached record after an edit (updates cache + notifies subscribers)
patchCachedRecord(layout, cacheVersion, recordId, fieldData)

// Subscribe to cache updates (used by useAllRecords internally)
subscribeCacheUpdates(layout, cacheVersion, callback)
```

`getRecord` is high-priority and will preempt in-flight batch pages. Use it for interactive selection.

---

## Hash-based routing

URL format: `#moduleId` or `#moduleId/recordId`

- Clicking a nav item: `pushHash(moduleId, null)`
- Clicking a list item: `pushHash(moduleId, recordId)` via `onRecordSelect?.(r.recordId)`
- Back/forward: handled by `popstate` listener in `App.jsx` → sets `navTarget` → each module's `useEffect` picks it up
- Deep links work on page load — `App.jsx` reads `parseHash()` for initial state

---

## Sidebar resize handle

```jsx
const [sidebarWidth, setSidebarWidth] = useState(300)
const dragging = useRef(false)

const onMouseDown = useCallback(e => {
  dragging.current = true
  const startX = e.clientX, startW = sidebarWidth
  const onMove = ev => { if (!dragging.current) return; setSidebarWidth(Math.max(220, Math.min(520, startW + ev.clientX - startX))) }
  const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}, [sidebarWidth])

// In JSX:
<aside style={{ width: sidebarWidth }}>...</aside>
<div className="xx-resize-handle" onMouseDown={onMouseDown} />
<main>...</main>
```

```css
.xx-resize-handle { width: 4px; background: #1e2130; cursor: col-resize; flex-shrink: 0; transition: background 0.15s; }
.xx-resize-handle:hover { background: #e8322a; }
```
