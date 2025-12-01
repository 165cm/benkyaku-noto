import { useState, useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookOpen, Home, Calendar, BarChart3, Settings, PanelLeftClose, PanelLeft, LogOut, User as UserIcon, Cloud } from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '@/store/authStore'
import { useAutoSync } from '@/hooks/useAutoSync'
import ToastContainer from './Toast'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { user, signOut } = useAuthStore()
  const { isSyncing } = useAutoSync()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed')
    return saved === 'true'
  })
  const [showUserMenu, setShowUserMenu] = useState(false)

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(isSidebarCollapsed))
  }, [isSidebarCollapsed])

  const navItems = [
    { path: '/', icon: Home, label: 'ホーム' },
    { path: '/workbooks', icon: BookOpen, label: '問題集' },
    { path: '/review', icon: Calendar, label: '復習' },
    { path: '/stats', icon: BarChart3, label: '統計' },
    { path: '/settings', icon: Settings, label: '設定' },
  ]

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden md:flex p-1.5 hover:bg-gray-100 rounded transition-colors"
              title={isSidebarCollapsed ? 'サイドバーを表示' : 'サイドバーを非表示'}
            >
              {isSidebarCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
            </button>
            <h1 className="text-xl font-bold">弱点克服ノート</h1>

            {/* 同期状態インジケーター */}
            {isSyncing && (
              <div className="flex items-center gap-1 text-xs text-gray-500 ml-2" title="クラウドから同期中">
                <Cloud size={14} className="animate-pulse" />
                <span className="hidden sm:inline">同期中...</span>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 rounded-md transition-colors"
            >
              <UserIcon size={18} />
              <span className="text-sm hidden sm:inline">
                {user?.displayName || user?.email?.split('@')[0] || 'ユーザー'}
              </span>
            </button>

            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-20">
                  <div className="px-4 py-2 border-b border-gray-200">
                    <p className="text-sm font-medium text-gray-900">
                      {user?.displayName || 'ユーザー'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <LogOut size={16} />
                    ログアウト
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Sidebar */}
        {!isSidebarCollapsed && (
          <aside className="w-64 bg-white border-r border-border hidden md:block sticky top-[52px] h-[calc(100vh-52px)] overflow-y-auto">
            <nav className="p-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
                      isActive
                        ? 'bg-secondary font-medium'
                        : 'hover:bg-secondary/50'
                    )}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>
          </aside>
        )}

        {/* Page Content */}
        <main className="flex-1 bg-gray-50 overflow-auto">
          <div className="max-w-5xl mx-auto p-6">{children}</div>
        </main>
      </div>

      {/* Mobile Navigation */}
      <nav className="md:hidden bg-white border-t border-border fixed bottom-0 left-0 right-0 z-40">
        <div className="flex justify-around">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path

            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex flex-col items-center gap-1 px-4 py-2',
                  isActive ? 'text-primary' : 'text-gray-500'
                )}
              >
                <Icon size={20} />
                <span className="text-xs">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  )
}
