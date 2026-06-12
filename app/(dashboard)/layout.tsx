import { UserProvider } from '@/contexts/UserContext'
import { TopNav } from '@/components/layout/TopNav'
import { ToastProvider } from '@/components/ui/Toast'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <TopNav />
      <main className="main-content page-enter">
        {children}
      </main>
      <ToastProvider />
    </UserProvider>
  )
}
