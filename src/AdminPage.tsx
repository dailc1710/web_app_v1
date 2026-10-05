import { useEffect, useMemo, useState, type FormEvent } from "react"
import { publishSync, subscribeSync } from "./sync"

const sentResultsKey = "tmmc-sent-results"
const statusKey = "tmmc-admin-statuses"
const accountsKey = "tmmc-admin-accounts"
const appointmentsKey = "tmmc-appointments"
const notificationsKey = "tmmc-notifications"
const adminSessionKey = "tmmc-admin-session"

type Appointment = { date: string }
type InternalNotification = {
  id: string
  submissionId: string
  createdAt: string
  read: boolean
}
type WorkflowStatus =
  | "submitted"
  | "sales_confirmed"
  | "pdf_ready"
  | "sent_cskh"
  | "checked_in"
  | "in_service"
  | "completed"

type Account = {
  id: string
  name: string
  username: string
  role: "admin" | "doctor" | "staff"
  department: string
  password: string
  active: boolean
  createdAt: string
}

type ResultItem = { id: string; vi: string; text?: string }
type ResultGroup = {
  title: string
  contrast?: boolean
  items: ResultItem[]
}
type Submission = {
  id: string
  sentAt: string
  submittedBy?: {
    name: string
    username: string
    role: "doctor" | "collaborator"
  }
  patient: Record<string, string>
  flags: Record<string, boolean>
  priority: "urgent" | "normal" | null
  diagnosis: string
  results: ResultGroup[]
  returnEmail?: string
  returnAddress?: string
  staffName?: string
  appointment?: {
    date: string
    time: string
    department?: string
    note?: string
  } | null
}

function loadSubmissions(): Submission[] {
  try {
    const value = JSON.parse(localStorage.getItem(sentResultsKey) || "[]")
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function loadStatuses(): Record<string, WorkflowStatus> {
  try {
    const value = JSON.parse(localStorage.getItem(statusKey) || "{}")
    return value && typeof value === "object" ? value : {}
  } catch {
    return {}
  }
}

const workflow: Array<{ id: WorkflowStatus; label: string; action: string }> = [
  { id: "submitted", label: "Đã gửi", action: "Sales xác nhận lịch" },
  { id: "sales_confirmed", label: "Sales đã xác nhận", action: "Xác nhận phiếu PDF" },
  { id: "pdf_ready", label: "Phiếu PDF sẵn sàng", action: "Chuyển cho CSKH" },
  { id: "sent_cskh", label: "Đã chuyển CSKH", action: "Check-in bệnh nhân" },
  { id: "checked_in", label: "Bệnh nhân đã đến", action: "Bắt đầu dịch vụ" },
  { id: "in_service", label: "Đang thực hiện", action: "Hoàn tất dịch vụ" },
  { id: "completed", label: "Đã hoàn tất", action: "Đã hoàn tất" },
]

function loadAccounts(): Account[] {
  const defaultAdmin: Account = {
    id: "admin-default",
    name: "Quản trị hệ thống",
    username: "admin",
    role: "admin",
    department: "Ban quản trị",
    password: "Admin@123",
    active: true,
    createdAt: new Date().toISOString(),
  }
  try {
    const saved = JSON.parse(localStorage.getItem(accountsKey) || "[]")
    if (Array.isArray(saved) && saved.length > 0) {
      return saved.some((account) => account.id === defaultAdmin.id)
        ? saved
        : [defaultAdmin, ...saved]
    }
  } catch {
    // Fall through to the initial admin account.
  }
  return [defaultAdmin]
}

function hasAdminSession() {
  try {
    return sessionStorage.getItem(adminSessionKey) === "authenticated"
  } catch {
    return false
  }
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const account = loadAccounts().find(
      (item) => item.username.toLowerCase() === username.trim().toLowerCase(),
    )
    if (!account || account.password !== password) {
      setError("Tên đăng nhập hoặc mật khẩu không đúng.")
      return
    }
    if (account.role !== "admin") {
      setError("Tài khoản này không có quyền quản trị.")
      return
    }
    if (!account.active) {
      setError("Tài khoản quản trị đã bị khóa.")
      return
    }
    sessionStorage.setItem(adminSessionKey, "authenticated")
    onLogin()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-8 text-ink">
      <section className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_16px_45px_rgba(20,33,61,0.14)]">
        <div className="bg-gradient-to-r from-brand-deep to-brand px-6 py-6 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">Cổng nội bộ Tâm Trí</p>
          <h1 className="mt-1 text-2xl font-extrabold">Đăng nhập quản trị</h1>
          <p className="mt-1 text-xs text-white/75">Trung tâm tiếp nhận chỉ định</p>
        </div>
        <form onSubmit={submit} className="grid gap-5 p-6">
          <label className="grid gap-1.5 text-sm font-semibold">Tên đăng nhập
            <input autoFocus required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Nhập tên đăng nhập" className="h-11 rounded-lg border border-line bg-ground/40 px-3 font-normal outline-none focus:border-brand-mid focus:ring-2 focus:ring-brand-mid/20" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">Mật khẩu
            <span className="relative">
              <input required autoComplete="current-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" className="h-11 w-full rounded-lg border border-line bg-ground/40 px-3 pr-16 font-normal outline-none focus:border-brand-mid focus:ring-2 focus:ring-brand-mid/20" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 px-3 text-[11px] font-bold text-brand">{showPassword ? "Ẩn" : "Hiện"}</button>
            </span>
          </label>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-urgent">{error}</p>}
          <button type="submit" className="h-11 rounded-lg bg-brand text-sm font-bold text-white hover:bg-brand-deep">Đăng nhập quản trị</button>
          <div className="rounded-lg border border-line bg-ground/50 p-3 text-[11px] text-ink-soft">
            <p className="font-semibold text-ink">Tài khoản quản trị mặc định</p>
            <p className="mt-1"><span className="font-mono">admin</span> / <span className="font-mono">Admin@123</span></p>
          </div>
          <a href="/" className="text-center text-xs font-semibold text-brand hover:underline">Về trang gửi phiếu</a>
        </form>
      </section>
    </main>
  )
}

function loadAppointments(): Appointment[] {
  try {
    const value = JSON.parse(localStorage.getItem(appointmentsKey) || "[]")
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function loadNotifications(): InternalNotification[] {
  try {
    const value = JSON.parse(localStorage.getItem(notificationsKey) || "[]")
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function AccountManagement() {
  const [accounts, setAccounts] = useState<Account[]>(loadAccounts)
  const [search, setSearch] = useState("")

  useEffect(() => {
    const refreshAccounts = () => setAccounts(loadAccounts())
    const unsubscribe = subscribeSync((topic) => {
      if (!topic || topic === "accounts") refreshAccounts()
    })
    window.addEventListener("focus", refreshAccounts)
    window.addEventListener("pageshow", refreshAccounts)
    return () => {
      unsubscribe()
      window.removeEventListener("focus", refreshAccounts)
      window.removeEventListener("pageshow", refreshAccounts)
    }
  }, [])

  const save = (next: Account[]) => {
    setAccounts(next)
    localStorage.setItem(accountsKey, JSON.stringify(next))
    publishSync("accounts")
  }
  const filtered = accounts.filter((account) =>
    [account.name, account.username, account.department]
      .join(" ")
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )
  const roleLabel = { admin: "Quản trị viên", doctor: "Bác sĩ", staff: "Nhân viên" }

  return (
    <div>
      <section className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-extrabold">Danh sách tài khoản</h2><p className="mt-1 text-xs text-ink-soft">{accounts.filter((account) => account.active).length} đang hoạt động · {accounts.length} tổng cộng</p></div>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tài khoản…" className="h-10 rounded-md border border-line bg-ground/40 px-3 text-sm outline-none focus:border-brand-mid" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-ground/60 text-xs uppercase tracking-wide text-ink-soft"><tr><th className="px-5 py-3">Người dùng</th><th className="px-5 py-3">Vai trò</th><th className="px-5 py-3">Phòng ban</th><th className="px-5 py-3">Trạng thái</th><th className="px-5 py-3 text-right">Thao tác</th></tr></thead>
            <tbody className="divide-y divide-line">
              {filtered.map((account) => (
                <tr key={account.id} className="hover:bg-ground/30">
                  <td className="px-5 py-4"><p className="font-bold">{account.name}</p><p className="mt-1 font-mono text-xs text-ink-soft">@{account.username}</p></td>
                  <td className="px-5 py-4"><span className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-semibold text-brand">{roleLabel[account.role]}</span></td>
                  <td className="px-5 py-4 text-ink-soft">{account.department}</td>
                  <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${account.active ? "text-ok" : "text-ink-soft"}`}><span className={`h-2 w-2 rounded-full ${account.active ? "bg-ok" : "bg-line"}`} />{account.active ? "Hoạt động" : "Đã khóa"}</span></td>
                  <td className="px-5 py-4 text-right"><button type="button" disabled={account.id === "admin-default"} onClick={() => save(accounts.map((item) => item.id === account.id ? { ...item, active: !item.active } : item))} className="rounded-md border border-line px-3 py-2 text-xs font-semibold text-ink-soft hover:border-brand-mid hover:text-brand disabled:cursor-not-allowed disabled:opacity-40">{account.active ? "Khóa" : "Mở khóa"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
})

export default function AdminPage() {
  const [adminAuthenticated, setAdminAuthenticated] = useState(hasAdminSession)
  const [activeView, setActiveView] = useState<"submissions" | "accounts">("submissions")
  const [submissions, setSubmissions] = useState<Submission[]>(loadSubmissions)
  const [appointments, setAppointments] = useState<Appointment[]>(loadAppointments)
  const [notifications, setNotifications] = useState<InternalNotification[]>(loadNotifications)
  const [statuses, setStatuses] = useState(loadStatuses)
  const [selectedId, setSelectedId] = useState<string | null>(
    () => loadSubmissions()[0]?.id || null,
  )
  const [query, setQuery] = useState("")

  const refresh = () => {
    setSubmissions(loadSubmissions())
    setAppointments(loadAppointments())
    setNotifications(loadNotifications())
  }
  useEffect(() => {
    const unsubscribe = subscribeSync(() => refresh())
    window.addEventListener("focus", refresh)
    return () => {
      unsubscribe()
      window.removeEventListener("focus", refresh)
    }
  }, [])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return submissions
    return submissions.filter((submission) =>
      [submission.id, submission.patient.name, submission.patient.id]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalized)),
    )
  }, [query, submissions])

  const selected =
    submissions.find((submission) => submission.id === selectedId) ||
    filtered[0] ||
    null
  const completed = submissions.filter(
    (submission) => statuses[submission.id] === "completed",
  ).length
  const urgent = submissions.filter(
    (submission) => submission.priority === "urgent",
  ).length
  const dailyAppointments = useMemo(() => {
    const counts = appointments.reduce<Record<string, number>>((result, appointment) => {
      result[appointment.date] = (result[appointment.date] || 0) + 1
      return result
    }, {})
    const today = new Date()
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() + index)
      const key = toDateKey(date)
      return {
        key,
        label: index === 0 ? "Hôm nay" : date.toLocaleDateString("vi-VN", { weekday: "short" }),
        dateLabel: date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
        value: counts[key] || 0,
      }
    })
  }, [appointments])
  const maxAppointments = Math.max(1, ...dailyAppointments.map((item) => item.value))
  const todayAppointments = dailyAppointments[0]?.value || 0
  const unreadNotifications = notifications.filter((item) => !item.read).length

  const getStatus = (id: string): WorkflowStatus => {
    const status = statuses[id] as WorkflowStatus | "received" | undefined
    return !status || status === "received" ? "submitted" : status
  }
  const setStatus = (id: string, status: WorkflowStatus) => {
    const next = { ...statuses, [id]: status }
    setStatuses(next)
    localStorage.setItem(statusKey, JSON.stringify(next))
    publishSync("statuses")
  }
  const advanceStatus = (id: string) => {
    const currentIndex = workflow.findIndex((step) => step.id === getStatus(id))
    const next = workflow[Math.min(currentIndex + 1, workflow.length - 1)]
    if (next) setStatus(id, next.id)
  }

  if (!adminAuthenticated) {
    return <AdminLogin onLogin={() => setAdminAuthenticated(true)} />
  }

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="border-b border-line bg-brand-deep text-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
              Tâm Trí Sài Gòn
            </p>
            <h1 className="mt-1 text-xl font-extrabold md:text-2xl">
              Trung tâm tiếp nhận chỉ định
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={refresh}
              className="rounded-md border border-white/30 px-4 py-2 text-xs font-semibold hover:bg-white/10"
            >
              Làm mới dữ liệu
            </button>
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem(adminSessionKey)
                setAdminAuthenticated(false)
              }}
              className="rounded-md border border-white/30 px-4 py-2 text-xs font-semibold hover:bg-white/10"
            >
              Đăng xuất
            </button>
            <a
              href="/"
              className="rounded-md bg-white px-4 py-2 text-xs font-bold text-brand-deep"
            >
              Về trang gửi phiếu
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-6 md:px-8">
        <nav className="mb-6 flex w-fit gap-1 rounded-xl border border-line bg-white p-1.5 shadow-sm" aria-label="Quản trị">
          <button type="button" onClick={() => setActiveView("submissions")} className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${activeView === "submissions" ? "bg-brand text-white" : "text-ink-soft hover:bg-ground"}`}>Tiếp nhận phiếu</button>
          <button type="button" onClick={() => setActiveView("accounts")} className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${activeView === "accounts" ? "bg-brand text-white" : "text-ink-soft hover:bg-ground"}`}>Quản trị tài khoản</button>
        </nav>
        {activeView === "accounts" ? (
          <AccountManagement />
        ) : (
          <>
        {unreadNotifications > 0 && (
          <section className="mb-6 flex flex-col gap-3 rounded-xl border border-brand/20 bg-brand-tint p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-brand">Sales có {unreadNotifications} phiếu mới cần tiếp nhận</p>
              <p className="mt-1 text-xs text-ink-soft">Thông báo nội bộ được tạo tự động khi bác sĩ hoặc cộng tác viên gửi phiếu.</p>
            </div>
            <button type="button" onClick={() => {
              const next = notifications.map((item) => ({ ...item, read: true }))
              setNotifications(next)
              localStorage.setItem(notificationsKey, JSON.stringify(next))
              publishSync("notifications")
            }} className="shrink-0 rounded-md bg-brand px-4 py-2 text-xs font-bold text-white">Đánh dấu đã đọc</button>
          </section>
        )}
        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Tổng phiếu", submissions.length, "text-brand"],
            ["Chờ xử lý", submissions.length - completed, "text-urgent"],
            ["Khẩn", urgent, "text-urgent"],
            ["Lịch khám hôm nay", todayAppointments, "text-brand"],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-xl border border-line bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
              <p className={`mt-2 text-3xl font-extrabold ${color}`}>{value}</p>
            </div>
          ))}
        </section>

        <section className="mb-6 rounded-xl border border-line bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-extrabold">Số lịch khám theo ngày</h2>
              <p className="mt-1 text-xs text-ink-soft">Lịch đã đặt trong 7 ngày, tính từ hôm nay</p>
            </div>
            <p className="text-xs font-semibold text-ink-soft">Tổng 7 ngày: <span className="font-mono text-base font-bold text-brand">{dailyAppointments.reduce((sum, item) => sum + item.value, 0)}</span></p>
          </div>
          <div className="mt-6 grid h-[230px] grid-cols-7 items-end gap-2 border-b border-line px-1 sm:gap-4">
            {dailyAppointments.map((item) => (
              <div key={item.key} className="group flex h-full flex-col items-center justify-end gap-2">
                <span className="font-mono text-xs font-bold text-brand">{item.value}</span>
                <div className="flex h-[150px] w-full items-end justify-center">
                  <div
                    className="w-full max-w-12 rounded-t-md border border-brand/20 bg-brand transition-all group-hover:bg-brand-mid"
                    style={{ height: item.value === 0 ? 4 : `${Math.max(12, (item.value / maxAppointments) * 100)}%` }}
                    title={`${item.dateLabel}: ${item.value} lịch khám`}
                  />
                </div>
                <div className="pb-3 text-center">
                  <p className="text-[10px] font-semibold text-ink sm:text-xs">{item.label}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-ink-soft sm:text-[10px]">{item.dateLabel}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[390px_1fr]">
          <section className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
            <div className="border-b border-line p-4">
              <h2 className="font-bold">Phiếu đã tiếp nhận</h2>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm tên, mã bệnh nhân, mã phiếu…"
                className="mt-3 h-10 w-full rounded-md border border-line bg-ground/50 px-3 text-sm outline-none focus:border-brand-mid focus:ring-2 focus:ring-brand-mid/20"
              />
            </div>
            <div className="max-h-[calc(100vh-330px)] min-h-[360px] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-ink-soft">Chưa có phiếu nào được gửi.</p>
              ) : (
                filtered.map((submission) => {
                  const isSelected = selected?.id === submission.id
                  const currentStatus = getStatus(submission.id)
                  const isCompleted = currentStatus === "completed"
                  return (
                    <button
                      key={submission.id}
                      type="button"
                      onClick={() => setSelectedId(submission.id)}
                      className={`mb-1 w-full rounded-lg border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-brand bg-brand-tint"
                          : "border-transparent hover:bg-ground/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-ink">
                            {submission.submittedBy?.role === "collaborator" ? "Cộng tác viên" : "Bác sĩ"}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-ink-soft">
                            Bệnh nhân: {submission.patient.name || "Chưa nhập tên"}
                          </p>
                          {submission.submittedBy?.name && <p className="mt-0.5 text-[11px] text-ink-soft">Người gửi: {submission.submittedBy.name}</p>}
                          <p className="mt-1 font-mono text-[11px] text-ink-soft">{submission.id}</p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${isCompleted ? "bg-green-100 text-ok" : "bg-amber-100 text-amber-700"}`}>
                          {workflow.find((step) => step.id === currentStatus)?.label}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] text-ink-soft">{dateFormatter.format(new Date(submission.sentAt))}</p>
                    </button>
                  )
                })
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
            {!selected ? (
              <div className="flex min-h-[500px] items-center justify-center text-sm text-ink-soft">Chọn một phiếu để xem chi tiết.</div>
            ) : (
              <>
                <div className="flex flex-col gap-4 border-b border-line bg-brand-tint/50 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-mono text-xs font-semibold text-brand">{selected.id}</p>
                    <h2 className="mt-1 text-xl font-extrabold">{selected.patient.name || "Chưa nhập tên"}</h2>
                    <p className="mt-1 text-xs text-ink-soft">Gửi lúc {dateFormatter.format(new Date(selected.sentAt))}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => window.print()} className="h-10 rounded-md border border-line bg-white px-4 text-xs font-bold text-ink-soft hover:border-brand-mid hover:text-brand">In / Lưu PDF</button>
                    <button
                      type="button"
                      disabled={getStatus(selected.id) === "completed"}
                      onClick={() => advanceStatus(selected.id)}
                      className="h-10 rounded-md bg-ok px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
                    >
                      {workflow.find((step) => step.id === getStatus(selected.id))?.action}
                    </button>
                  </div>
                </div>

                <div className="border-b border-line px-5 py-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-brand">Tiến trình xử lý</p>
                  <ol className="grid gap-2 sm:grid-cols-3 xl:grid-cols-7">
                    {workflow.map((step, index) => {
                      const currentIndex = workflow.findIndex((item) => item.id === getStatus(selected.id))
                      const reached = index <= currentIndex
                      return (
                        <li key={step.id} className={`rounded-md border px-2 py-2 text-center text-[10px] font-semibold ${reached ? "border-brand/30 bg-brand-tint text-brand" : "border-line bg-white text-ink-soft/60"}`}>
                          <span className={`mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full font-mono ${reached ? "bg-brand text-white" : "bg-line text-ink-soft"}`}>{index + 1}</span>
                          {step.label}
                        </li>
                      )
                    })}
                  </ol>
                </div>

                <div className="grid gap-6 p-5 xl:grid-cols-[1fr_1.2fr]">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-brand">Thông tin bệnh nhân</h3>
                    <dl className="mt-3 grid grid-cols-[130px_1fr] gap-x-3 gap-y-3 text-sm">
                      <dt className="text-ink-soft">Mã bệnh nhân</dt><dd className="font-medium">{selected.patient.id || "—"}</dd>
                      <dt className="text-ink-soft">Ngày sinh</dt><dd className="font-medium">{selected.patient.dob || "—"}</dd>
                      <dt className="text-ink-soft">Điện thoại</dt><dd className="font-medium">{selected.patient.phone || "—"}</dd>
                      <dt className="text-ink-soft">Địa chỉ</dt><dd className="font-medium">{selected.patient.address || "—"}</dd>
                      <dt className="text-ink-soft">Mức độ</dt><dd className={`font-bold ${selected.priority === "urgent" ? "text-urgent" : "text-ink"}`}>{selected.priority === "urgent" ? "Khẩn" : "Thường"}</dd>
                      <dt className="text-ink-soft">Lịch hẹn</dt><dd className="font-medium">{selected.appointment ? `${selected.appointment.date} · ${selected.appointment.time}` : "Chưa có lịch hẹn"}</dd>
                      <dt className="text-ink-soft">Khoa</dt><dd className="font-medium">{selected.appointment?.department || "—"}</dd>
                    </dl>
                    <div className="mt-5 rounded-lg border border-line bg-ground/40 p-4">
                      <p className="text-xs font-bold text-ink-soft">Chẩn đoán lâm sàng</p>
                      <p className="mt-2 text-sm leading-relaxed">{selected.diagnosis || "Chưa nhập chẩn đoán."}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-brand">Danh sách chỉ định</h3>
                    <div className="mt-3 grid gap-3">
                      {selected.results.map((group) => (
                        <article key={group.title} className="rounded-lg border border-line p-4">
                          <h4 className="text-sm font-bold text-brand">{group.title}{group.contrast ? " · Có cản" : ""}</h4>
                          <ul className="mt-2 grid gap-1.5">
                            {group.items.map((item) => (
                              <li key={item.id} className="border-l-2 border-brand-tint pl-3 text-sm text-ink-soft">
                                {item.vi}{item.text ? `: ${item.text}` : ""}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
          </>
        )}
      </main>
    </div>
  )
}
