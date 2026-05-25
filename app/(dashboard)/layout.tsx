import { UserProvider } from '@/contexts/UserContext'
import { TopNav } from '@/components/layout/TopNav'
import { ToastProvider } from '@/components/ui/Toast'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <TopNav />
      <main
        className="page-enter"
        style={{
          maxWidth: '1400px',
          margin:   '0 auto',
          padding:  '2rem',
        }}
      >
        {children}
      </main>
      <ToastProvider />
    </UserProvider>
  )
}
