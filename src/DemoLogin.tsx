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

export default function DemoLogin({ onLogin }: { onLogin: (session: DemoSession) => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [selectedRole, setSelectedRole] = useState<DemoSession["role"]>("doctor")
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
      setError("Tên đăng nhập cần từ 3–30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.")
      return
    }
    if (loadAccounts().some((item) => item.username.toLowerCase() === normalizedUsername)) {
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
    localStorage.setItem(accountsKey, JSON.stringify([account, ...loadSavedAccounts()]))
    publishSync("accounts")
    setMode("login")
    setFullName("")
    setConfirmPassword("")
    setPassword("")
    setSuccess("Tạo tài khoản thành công. Bạn có thể đăng nhập ngay.")
  }

  return (
    <section className="mx-auto max-w-[480px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_12px_40px_rgba(20,33,61,0.12)]">
      <div className="bg-gradient-to-r from-brand-deep to-brand px-5 py-5 text-white md:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">Cổng nội bộ Tâm Trí</p>
        <h1 className="mt-1 text-xl font-extrabold">{mode === "login" ? "Đăng nhập hệ thống" : "Tạo tài khoản"}</h1>
        <p className="mt-1 text-xs text-white/75">Dành cho bác sĩ và cộng tác viên</p>
      </div>

      <form onSubmit={mode === "login" ? submit : register} className="grid gap-5 p-5 md:p-6">
        {mode === "register" && (
          <>
            <label className="grid gap-1.5 text-sm font-semibold text-ink">
              Họ và tên
              <input autoFocus required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nhập họ và tên" className="h-11 rounded-lg border border-line bg-ground/40 px-3 text-sm font-normal outline-none transition-colors focus:border-brand-mid focus:bg-white focus:ring-2 focus:ring-brand-mid/20" />
            </label>
          </>
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
            className="h-11 rounded-lg border border-line bg-ground/40 px-3 text-sm font-normal outline-none transition-colors focus:border-brand-mid focus:bg-white focus:ring-2 focus:ring-brand-mid/20"
          />
        </label>

        {mode === "register" && (
          <label className="grid gap-1.5 text-sm font-semibold text-ink">
            Nhập lại mật khẩu
            <input required minLength={6} autoComplete="new-password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Nhập lại mật khẩu" className="h-11 rounded-lg border border-line bg-ground/40 px-3 text-sm font-normal outline-none transition-colors focus:border-brand-mid focus:bg-white focus:ring-2 focus:ring-brand-mid/20" />
          </label>
        )}

        <label className="grid gap-1.5 text-sm font-semibold text-ink">
          Mật khẩu
          <span className="relative">
            <input
              required
              autoComplete="current-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nhập mật khẩu"
              className="h-11 w-full rounded-lg border border-line bg-ground/40 px-3 pr-16 text-sm font-normal outline-none transition-colors focus:border-brand-mid focus:bg-white focus:ring-2 focus:ring-brand-mid/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute inset-y-0 right-0 px-3 text-[11px] font-semibold text-brand"
            >
              {showPassword ? "Ẩn" : "Hiện"}
            </button>
          </span>
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Vai trò</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ["doctor", "Bác sĩ", "Doctor"],
              ["collaborator", "Cộng tác viên", "Collaborator"],
            ] as const).map(([value, vi, en]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                  selectedRole === value
                    ? "border-brand bg-brand-tint text-brand"
                    : "border-line bg-white text-ink-soft hover:border-brand-mid"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={selectedRole === value}
                  onChange={() => setSelectedRole(value)}
                  className="h-4 w-4 accent-brand"
                />
                <span>
                  <span className="block text-sm font-bold">{vi}</span>
                  <span className="mt-0.5 block text-[10px] font-normal text-ink-soft">{en}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode === "login" && <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-ink-soft">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4 rounded accent-brand" />
          Ghi nhớ đăng nhập trên thiết bị này
        </label>}

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-urgent">{error}</p>}
        {success && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-xs font-medium text-ok">{success}</p>}

        <button type="submit" className="h-11 rounded-lg bg-brand px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-deep">{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</button>

        <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setSuccess("") }} className="h-10 rounded-lg border border-brand-mid text-sm font-bold text-brand transition-colors hover:bg-brand-tint">
          {mode === "login" ? "Chưa có tài khoản? Tạo tài khoản" : "Đã có tài khoản? Đăng nhập"}
        </button>

        {mode === "login" && <div className="rounded-lg border border-line bg-ground/50 p-3 text-[11px] leading-relaxed text-ink-soft">
          <p className="font-semibold text-ink">Tài khoản dùng thử</p>
          <p className="mt-1"><span className="font-mono">doctor</span> / <span className="font-mono">Doctor@123</span></p>
          <p><span className="font-mono">ctv</span> / <span className="font-mono">Ctv@123</span></p>
        </div>}
      </form>
    </section>
  )
}
