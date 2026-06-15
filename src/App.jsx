import { useState } from 'react'
import EnvSwitcher from './components/EnvSwitcher'
import NavRail from './components/NavRail'
import ProductsAndServicesV2 from './components/ProductsAndServicesV2'

const MODULES = [
  { id: 'products', label: 'Products & Services', icon: '📦' },
  // Add more modules here as new FMP layouts are built
]

function renderModule(id) {
  switch (id) {
    case 'products': return <ProductsAndServicesV2 />
    default: return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
        Coming soon
      </div>
    )
  }
}

export default function App() {
  const [activeModule, setActiveModule] = useState('products')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <EnvSwitcher />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <NavRail modules={MODULES} activeId={activeModule} onSelect={setActiveModule} />
        {renderModule(activeModule)}
      </div>
    </div>
  )
}
