import { useState } from 'react'
import EnvSwitcher from './components/EnvSwitcher'
import NavRail from './components/NavRail'
import ProductsAndServicesV2 from './components/ProductsAndServicesV2'
import './light-theme.css'

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

function getInitialTheme() {
  return localStorage.getItem('theme') ?? 'dark'
}

export default function App() {
  const [activeModule, setActiveModule] = useState('products')
  const [theme, setTheme] = useState(getInitialTheme)

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
  }

  return (
    <div data-theme={theme} style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <EnvSwitcher theme={theme} onToggleTheme={toggleTheme} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <NavRail modules={MODULES} activeId={activeModule} onSelect={setActiveModule} theme={theme} />
        {renderModule(activeModule)}
      </div>
    </div>
  )
}
