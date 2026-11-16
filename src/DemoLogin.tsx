import { useState, type FormEvent } from "react"
import { publishSync } from "./sync"

export const demoSessionKey = "tmmc-demo-session"
const accountsKey = "tmmc-admin-accounts"

export type DemoSession = {
  name: string
  username: string
  role: "doctor" | "collaborator"
  remember?: boolean
}

type StoredAccount = {
  id?: string
  name: string
  username: string
  password?: string
  role: "admin" | "doctor" | "staff"
  department?: string
  active: boolean
  createdAt?: string
}

const starterAccounts: StoredAccount[] = [
  {
    name: "Bác sĩ Demo",
    username: "doctor",
    password: "Doctor@123",
    role: "doctor",
    active: true,
  },
  {
    name: "Cộng tác viên Demo",
    username: "ctv",
    password: "Ctv@123",
    role: "staff",
    active: true,
  },
]

export function loadDemoSession(): DemoSession | null {
  try {
    const raw =
      localStorage.getItem(demoSessionKey) ||
      sessionStorage.getItem(demoSessionKey)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<DemoSession>
    if (
      typeof value.name === "string" &&
      typeof value.username === "string" &&
      (value.role === "doctor" || value.role === "collaborator")
    ) {
      return value as DemoSession
    }
  } catch {
    // Ignore invalid or unavailable storage.
  }
  return null
}

function loadAccounts(): StoredAccount[] {
  try {
    const saved = JSON.parse(localStorage.getItem(accountsKey) || "[]")
    return Array.isArray(saved) ? [...saved, ...starterAccounts] : starterAccounts
  } catch {
    return starterAccounts
  }
}

function loadSavedAccounts(): StoredAccount[] {
  try {
    const saved = JSON.parse(localStorage.getItem(accountsKey) || "[]")
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

export default function DemoLogin({
  onLogin,
}: {
  onLogin: (session: DemoSession) => void
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [selectedRole, setSelectedRole] =
    useState<DemoSession["role"]>("doctor")
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [mode, setMode] = useState<"login" | "register">("login")
  const [fullName, setFullName] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [success, setSuccess] = useState("")

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalizedUsername = username.trim().toLowerCase()
    const account = loadAccounts().find(
      (item) => item.username.toLowerCase() === normalizedUsername,
    )
    if (!account || account.password !== password) {
      setError("Tên đăng nhập hoặc mật khẩu không đúng.")
      return
    }
    if (!account.active) {
      setError("Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.")
      return
    }
    const accountRole: DemoSession["role"] =
      account.role === "doctor" ? "doctor" : "collaborator"
    if (accountRole !== selectedRole) {
      setError("Vai trò đã chọn không khớp với tài khoản.")
      return
    }
    setError("")
    onLogin({
      name: account.name,
      username: account.username,
      role: accountRole,
      remember,
    })
  }

  const register = (event: FormEvent) => {
    event.preventDefault()
    const normalizedUsername = username.trim().toLowerCase()
    setError("")
    setSuccess("")
    if (fullName.trim().length < 2) {
      setError("Vui lòng nhập họ và tên.")
      return
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(normalizedUsername)) {
      setError(
        "Tên đăng nhập cần từ 3–30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.",
      )
      return
    }
    if (
      loadAccounts().some(
        (item) => item.username.toLowerCase() === normalizedUsername,
      )
    ) {
      setError("Tên đăng nhập đã tồn tại.")
      return
    }
    if (password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.")
      return
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp.")
      return
    }
    const account: StoredAccount = {
      id: crypto.randomUUID(),
      name: fullName.trim(),
      username: normalizedUsername,
      password,
      role: selectedRole === "doctor" ? "doctor" : "staff",
      department: selectedRole === "doctor" ? "Bác sĩ" : "Cộng tác viên",
      active: true,
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem(
      accountsKey,
      JSON.stringify([account, ...loadSavedAccounts()]),
    )
    publishSync("accounts")
    setMode("login")
    setFullName("")
    setConfirmPassword("")
    setPassword("")
    setSuccess("Tạo tài khoản thành công. Bạn có thể đăng nhập ngay.")
  }

  return (
    <div className="app-screen">
      <header
        className="relative overflow-hidden px-5 pb-8 pt-[calc(28px+env(safe-area-inset-top))] text-white"
        style={{
          background:
            "linear-gradient(145deg, #142a6b 0%, #1b3a8f 55%, #2a56c6 100%)",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-8 h-40 w-40 rounded-full bg-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-12 left-8 h-28 w-28 rounded-full bg-white/10"
        />
        <p className="relative text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
          Cổng nội bộ
        </p>
        <h1 className="relative mt-2 text-[28px] font-extrabold leading-tight tracking-tight">
          Tâm Trí
        </h1>
        <p className="relative mt-1 text-sm text-white/80">
          {mode === "login"
            ? "Đăng nhập để tạo phiếu và theo dõi lịch khám"
            : "Tạo tài khoản bác sĩ hoặc cộng tác viên"}
        </p>
      </header>

      <form
        onSubmit={mode === "login" ? submit : register}
        className="app-fade relative -mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-t-[24px] bg-white/95 px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-6 shadow-[0_-8px_30px_rgba(20,33,61,0.08)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-ink">
            {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </h2>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login")
              setError("")
              setSuccess("")
            }}
            className="text-xs font-bold text-brand"
          >
            {mode === "login" ? "Đăng ký" : "Đăng nhập"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-ground p-1">
          {(
            [
              ["doctor", "Bác sĩ"],
              ["collaborator", "Cộng tác viên"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={selectedRole === value}
              onClick={() => setSelectedRole(value)}
              className={`h-10 rounded-[10px] text-sm font-bold transition-colors ${
                selectedRole === value
                  ? "bg-white text-brand shadow-sm"
                  : "text-ink-soft"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "register" && (
          <label className="grid gap-1.5 text-sm font-semibold text-ink">
            Họ và tên
            <input
              autoFocus
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Nhập họ và tên"
              className="app-input px-3.5 font-normal"
            />
          </label>
        )}

        <label className="grid gap-1.5 text-sm font-semibold text-ink">
          Tên đăng nhập
          <input
            autoFocus={mode === "login"}
            required
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Nhập tên đăng nhập"
            className="app-input px-3.5 font-normal"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-semibold text-ink">
          Mật khẩu
          <span className="relative">
            <input
              required
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nhập mật khẩu"
              className="app-input px-3.5 pr-16 font-normal"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute inset-y-0 right-0 px-3 text-[12px] font-semibold text-brand"
            >
              {showPassword ? "Ẩn" : "Hiện"}
            </button>
          </span>
        </label>

        {mode === "register" && (
          <label className="grid gap-1.5 text-sm font-semibold text-ink">
            Nhập lại mật khẩu
            <input
              required
              minLength={6}
              autoComplete="new-password"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Nhập lại mật khẩu"
              className="app-input px-3.5 font-normal"
            />
          </label>
        )}

        {mode === "login" && (
          <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-ink-soft">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-4 w-4 rounded accent-brand"
            />
            Ghi nhớ đăng nhập trên thiết bị này
          </label>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-urgent"
          >
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-xs font-medium text-ok"
          >
            {success}
          </p>
        )}

        <button type="submit" className="app-btn app-btn-primary mt-1 w-full">
          {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
        </button>

        {mode === "login" && (
          <p className="text-center text-[11px] leading-relaxed text-ink-soft">
            Dùng thử:{" "}
            <span className="font-mono text-ink">doctor / Doctor@123</span>
            {" · "}
            <span className="font-mono text-ink">ctv / Ctv@123</span>
          </p>
        )}
      </form>
    </div>
  )
}
