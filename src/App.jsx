import { useState } from 'react'
import EnvSwitcher from './components/EnvSwitcher'
import NavRail from './components/NavRail'
import ProductsAndServicesV2 from './components/ProductsAndServicesV2'
import Contacts from './components/Contacts'
import './light-theme.css'

const MODULES = [
  { id: 'contacts', label: 'Contacts', icon: '◉' },
  { id: 'products', label: 'Products & Services', icon: '📦' },
]

function getInitialTheme() {
  return localStorage.getItem('theme') ?? 'dark'
}

export default function App() {
  const [activeModule, setActiveModule] = useState('contacts')
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
        <div style={{ display: activeModule === 'contacts' ? 'contents' : 'none' }}><Contacts /></div>
        <div style={{ display: activeModule === 'products' ? 'contents' : 'none' }}><ProductsAndServicesV2 /></div>
      </div>
    </div>
  )
}
