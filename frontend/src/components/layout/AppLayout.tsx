import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'
import { InstallPrompt } from '../pwa/InstallPrompt'
import { UpdatePrompt } from '../pwa/UpdatePrompt'

function getDefaultCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  const w = window.innerWidth
  return w >= 768 && w < 1024
}

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getDefaultCollapsed)
  const [userToggled, setUserToggled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth
      if (!userToggled) {
        if (w >= 768 && w < 1024) {
          setSidebarCollapsed(true)
        } else if (w >= 1024) {
          setSidebarCollapsed(false)
        }
      }
      if (w >= 768) {
        setMobileOpen(false)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [userToggled])

  const handleToggle = () => {
    setUserToggled(true)
    setSidebarCollapsed((c) => !c)
  }

  return (
    <div className="app-bg-pattern h-screen overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={handleToggle}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div
        className={`flex h-screen min-w-0 flex-col transition-all duration-300 md:ml-0 ${
          sidebarCollapsed ? 'md:ml-20' : 'md:ml-[260px]'
        }`}
      >
        <Header onMenuClick={() => setMobileOpen(true)} />

        <main className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-6">
          <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileNav />
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  )
}
