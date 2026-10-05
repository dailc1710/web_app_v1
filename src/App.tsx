import { useEffect, useMemo, useState } from "react"
import AdminPage from "./AdminPage"
import AppointmentTab from "./AppointmentTab"
import DemoLogin, {
  demoSessionKey,
  loadDemoSession,
  type DemoSession,
} from "./DemoLogin"
import { groups, labGroups, packages, patientFields, type Group } from "./data"
import { publishSync, subscribeSync } from "./sync"

const STORAGE_KEY = "tmmc-phieu-chi-dinh"
const SENT_RESULTS_KEY = "tmmc-sent-results"
const ADMIN_STATUSES_KEY = "tmmc-admin-statuses"
const NOTIFICATIONS_KEY = "tmmc-notifications"
const APPOINTMENTS_KEY = "tmmc-appointments"
const workflowLabels: Record<string, string> = {
  submitted: "Đã gửi",
  sales_confirmed: "Sales đã xác nhận",
  pdf_ready: "Phiếu PDF sẵn sàng",
  sent_cskh: "Đã chuyển CSKH",
  checked_in: "Đã check-in",
  in_service: "Đang thực hiện",
  completed: "Đã hoàn tất",
  received: "Đã gửi",
}

type FormState = {
  patient: Record<string, string>
  flags: {
    bhyt: boolean
    service: boolean
    reexam: boolean
  }
  priority: "urgent" | "normal" | null
  diagnosis: string
  selected: string[]
  contrast: Record<string, boolean>
  notes: Record<string, string>
  returnEmail: string
  returnAddress: string
  staffName: string
}

const emptyForm: FormState = {
  patient: {},
  flags: { bhyt: false, service: false, reexam: false },
  priority: null,
  diagnosis: "",
  selected: [],
  contrast: {},
  notes: {},
  returnEmail: "",
  returnAddress: "",
  staffName: "",
}

function loadForm(): FormState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      return Object.fromEntries(
        Object.entries(emptyForm).map(([key, value]) => [
          key,
          saved[key] ?? value,
        ]),
      ) as FormState
    }
  } catch {
    /* ignore */
  }
  return emptyForm
}

const norm = (s: string) =>
  s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")

const allGroups = [...groups, ...labGroups, ...packages]

function buildSummary(
  selected: Set<string>,
  contrast: Record<string, boolean>,
  notes: Record<string, string>,
) {
  return allGroups
    .map((g) => ({
      title: g.vi,
      items: g.choices
        .filter((c) => selected.has(c.id))
        .map((c) => ({
          ...c,
          text: c.freetext ? notes[c.id]?.trim() || "" : "",
        })),
      contrast: g.toggle ? contrast[g.id] : undefined,
    }))
    .filter((g) => g.items.length > 0)
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const nText = norm(text)
  const nQ = norm(query)
  const i = nText.indexOf(nQ)
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-brand-mid/20 px-0.5 text-brand-deep">
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  )
}

function Check({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
        checked
          ? "border-brand bg-brand text-white"
          : "border-line bg-white group-hover:border-brand-mid"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
          <path
            d="M2.5 6.2 5 8.6l4.5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  )
}

function Panel({
  group,
  selected,
  toggle,
  contrast,
  onContrast,
  query,
  notes,
  setNote,
}: {
  group: Group
  selected: Set<string>
  toggle: (id: string) => void
  contrast?: boolean
  onContrast?: () => void
  query: string
  notes: Record<string, string>
  setNote: (id: string, v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const visible = query
    ? group.choices.filter((c) => norm(c.vi).includes(norm(query)))
    : group.choices
  if (visible.length === 0) return null
  const expanded = open || !!query
  const count = group.choices.reduce(
    (n, c) => n + (selected.has(c.id) ? 1 : 0),
    0,
  )
  return (
    <section className="flex break-inside-avoid flex-col overflow-hidden rounded-lg border border-line bg-white shadow-[0_1px_2px_rgba(20,33,61,0.04)]">
      <header className="flex items-center gap-2 bg-brand px-3.5 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left text-white"
          aria-expanded={expanded}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path
              d="m9 6 6 6-6 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="flex items-baseline gap-2">
            <span className="text-[13px] font-bold uppercase tracking-wide">
              {group.vi}
            </span>
            {group.en && (
              <span className="text-[11px] font-medium text-white/70">
                | {group.en}
              </span>
            )}
          </span>
          {count > 0 && (
            <span className="ml-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 font-mono text-[11px] font-semibold text-brand">
              {count}
            </span>
          )}
        </button>
        {group.toggle && (
          <button
            type="button"
            onClick={onContrast}
            className={`flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              contrast
                ? "bg-white text-brand"
                : "bg-white/15 text-white hover:bg-white/25"
            }`}
          >
            <Check checked={!!contrast} />
            {group.toggle.vi}
          </button>
        )}
      </header>
      <div className={`p-3.5 ${expanded ? "" : "hidden"}`}>
        <ul
          className={`grid gap-x-4 gap-y-1.5 ${
            group.columns === 2 ? "sm:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {visible.map((c) => {
            const on = selected.has(c.id)
            return (
              <li
                key={c.id}
                className={c.freetext && on ? "sm:col-span-2" : undefined}
              >
                <label className="group flex cursor-pointer items-center gap-2 rounded py-0.5 text-[13px] leading-snug">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => toggle(c.id)}
                  />
                  <Check checked={on} />
                  <span
                    className={on ? "font-medium text-ink" : "text-ink-soft"}
                  >
                    <Highlight text={c.vi} query={query} />
                  </span>
                </label>
                {c.freetext && on && (
                  <input
                    type="text"
                    autoFocus
                    value={notes[c.id] || ""}
                    onChange={(e) => setNote(c.id, e.target.value)}
                    placeholder="Nhập nội dung…"
                    className="mt-1 ml-[23px] h-8 w-[calc(100%-23px)] rounded-md border border-brand-mid/40 bg-brand-tint/40 px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-mid focus:bg-white focus:ring-2 focus:ring-brand-mid/20"
                  />
                )}
              </li>
            )
          })}
        </ul>
        {group.hint && (
          <p className="mt-2.5 border-t border-dashed border-line pt-2 text-[11px] italic text-ink-soft/80">
            {group.hint}
          </p>
        )}
      </div>
    </section>
  )
}

function Field({
  vi,
  en,
  span,
  value,
  onChange,
}: {
  vi: string
  en: string
  span: number
  value: string
  onChange?: (v: string) => void
}) {
  const spanClass =
    span === 3
      ? "md:col-span-3"
      : span === 2
        ? "md:col-span-2"
        : "md:col-span-1"
  return (
    <div className={`flex flex-col gap-1 ${spanClass}`}>
      <label className="flex items-baseline gap-1.5 text-[12px]">
        <span className="font-semibold text-ink">{vi}</span>
        <span className="text-[11px] text-ink-soft">/ {en}</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="h-9 rounded-md border border-line bg-brand-tint/40 px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-mid focus:bg-white focus:ring-2 focus:ring-brand-mid/20"
      />
    </div>
  )
}

function balance(items: Group[], cols: number): Group[][] {
  const columns: Group[][] = Array.from({ length: cols }, () => [])
  const heights = new Array(cols).fill(0)
  for (const g of items) {
    const i = heights.indexOf(Math.min(...heights))
    columns[i].push(g)
    heights[i] += g.choices.length + 3
  }
  return columns
}

function BalancedColumns(props: {
  items: Group[]
  cols?: number
  selected: Set<string>
  toggle: (id: string) => void
  query: string
  contrast: Record<string, boolean>
  onContrast: (id: string) => void
  notes: Record<string, string>
  setNote: (id: string, v: string) => void
}) {
  const {
    items,
    cols = 2,
    selected,
    toggle,
    query,
    contrast,
    onContrast,
    notes,
    setNote,
  } = props
  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      {balance(items, cols).map((col, i) => (
        <div key={i} className="flex flex-1 flex-col gap-5">
          {col.map((g) => (
            <Panel
              key={g.id}
              group={g}
              selected={selected}
              toggle={toggle}
              query={query}
              contrast={contrast[g.id]}
              onContrast={() => onContrast(g.id)}
              notes={notes}
              setNote={setNote}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function HospitalHeader() {
  return (
    <header className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(20,33,61,0.04)] md:mb-5 md:flex-row md:items-center md:justify-between md:gap-4 md:p-5">
      <div className="flex items-center gap-3 md:gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white md:h-14 md:w-14">
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7 md:h-8 md:w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z" />
            <path
              d="M9 12h2l1-2 1.5 3 1-1h1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p className="text-[14px] font-extrabold uppercase leading-[1.2] tracking-normal text-brand md:text-[15px] md:tracking-wide">
            Bệnh viện Đa khoa Tâm Trí Sài Gòn
          </p>
          <p className="mt-1 text-[11px] leading-snug text-ink-soft md:hidden">
            P. Đông Hưng Thuận, TP. Hồ Chí Minh
          </p>
          <p className="hidden text-[12px] text-ink-soft md:block">
            171/3 Trường Chinh, P. Đông Hưng Thuận, TP. HCM
          </p>
        </div>
      </div>
      <div className="hidden flex-col gap-0.5 text-[12px] text-ink-soft md:flex md:text-right">
        <span>
          <span className="font-semibold text-ink">f.</span> (84) 28 6260 1100
        </span>
        <span>
          <span className="font-semibold text-ink">e.</span>{" "}
          info.d12@tmmchealthcare.com
        </span>
        <a
          className="font-mono text-[11px] text-brand-mid hover:underline"
          href="https://bvtamtrisaigon.com.vn/"
        >
          bvtamtrisaigon.com.vn
        </a>
      </div>
    </header>
  )
}

function PatientApp() {
  const [session, setSession] = useState<DemoSession | null>(loadDemoSession)
  const [activeTab, setActiveTab] =
    useState<"prescription" | "appointments" | "history" | "account">("prescription")
  const [form, setForm] = useState<FormState>(loadForm)
  const [query, setQuery] = useState("")
  const [sendStatus, setSendStatus] = useState<{
    state: "idle" | "sent" | "error"
    message: string
  }>({ state: "idle", message: "" })
  const [syncRevision, setSyncRevision] = useState(0)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
    } catch {
      /* ignore */
    }
  }, [form])
  useEffect(
    () => subscribeSync(() => setSyncRevision((revision) => revision + 1)),
    [],
  )

  const sentOrders = useMemo(() => {
    try {
      const orders = JSON.parse(localStorage.getItem(SENT_RESULTS_KEY) || "[]")
      const statuses = JSON.parse(localStorage.getItem(ADMIN_STATUSES_KEY) || "{}")
      return (Array.isArray(orders) ? orders : []).slice(0, 5).map((order) => ({
        id: order.id as string,
        sentAt: order.sentAt as string,
        status: workflowLabels[statuses[order.id] || "submitted"] || "Đã gửi",
      }))
    } catch {
      return []
    }
  }, [syncRevision, sendStatus])

  const selectedSet = useMemo(() => new Set(form.selected), [form.selected])
  const summary = useMemo(
    () => buildSummary(selectedSet, form.contrast, form.notes),
    [selectedSet, form.contrast, form.notes],
  )
  const total = form.selected.length

  const toggle = (id: string) =>
    setForm((f) => ({
      ...f,
      selected: f.selected.includes(id)
        ? f.selected.filter((x) => x !== id)
        : [...f.selected, id],
    }))
  const setContrastId = (id: string) =>
    setForm((f) => ({
      ...f,
      contrast: { ...f.contrast, [id]: !f.contrast[id] },
    }))
  const setPatient = (id: string, v: string) =>
    setForm((f) => ({ ...f, patient: { ...f.patient, [id]: v } }))
  const setNote = (id: string, v: string) =>
    setForm((f) => ({ ...f, notes: { ...f.notes, [id]: v } }))

  const matchCount = query
    ? allGroups.reduce(
        (n, g) =>
          n + g.choices.filter((c) => norm(c.vi).includes(norm(query))).length,
        0,
      )
    : 0

  const sendResults = () => {
    if (summary.length === 0) return

    if (!form.patient.name?.trim()) {
      setSendStatus({
        state: "error",
        message: "Vui lòng nhập tên bệnh nhân trước khi gửi.",
      })
      return
    }

    try {
      const sentAt = new Date()
      const submissionId = `TTSG-${sentAt.getTime().toString(36).toUpperCase()}`
      const saved = JSON.parse(localStorage.getItem(SENT_RESULTS_KEY) || "[]")
      const history = Array.isArray(saved) ? saved : []
      const appointments = JSON.parse(localStorage.getItem(APPOINTMENTS_KEY) || "[]")
      const appointment = Array.isArray(appointments)
        ? appointments
            .filter(
              (item) =>
                item.patientId === form.patient.id ||
                item.patientName?.trim().toLowerCase() ===
                  form.patient.name.trim().toLowerCase(),
            )
            .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0] || null
        : null
      history.unshift({
        id: submissionId,
        sentAt: sentAt.toISOString(),
        submittedBy: {
          name: session.name,
          username: session.username,
          role: session.role,
        },
        patient: form.patient,
        flags: form.flags,
        priority: form.priority,
        diagnosis: form.diagnosis,
        results: summary,
        returnEmail: form.returnEmail,
        returnAddress: form.returnAddress,
        staffName: form.staffName,
        appointment,
      })
      localStorage.setItem(SENT_RESULTS_KEY, JSON.stringify(history.slice(0, 100)))
      const statuses = JSON.parse(localStorage.getItem(ADMIN_STATUSES_KEY) || "{}")
      localStorage.setItem(
        ADMIN_STATUSES_KEY,
        JSON.stringify({ ...statuses, [submissionId]: "submitted" }),
      )
      const notifications = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || "[]")
      const notificationHistory = Array.isArray(notifications) ? notifications : []
      notificationHistory.unshift({
        id: crypto.randomUUID(),
        type: "sales_new_order",
        submissionId,
        createdAt: sentAt.toISOString(),
        read: false,
      })
      localStorage.setItem(
        NOTIFICATIONS_KEY,
        JSON.stringify(notificationHistory.slice(0, 100)),
      )
      publishSync("submissions")
      publishSync("statuses")
      publishSync("notifications")
      setSendStatus({
        state: "sent",
        message: `Đã gửi cho bộ phận tiếp nhận · Mã ${submissionId}`,
      })
    } catch {
      setSendStatus({
        state: "error",
        message: "Không thể gửi phiếu. Vui lòng thử lại.",
      })
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-[880px] px-4 py-6 md:px-8 md:py-10">
          <HospitalHeader />
          <DemoLogin
            onLogin={(nextSession) => {
              try {
                const storage = nextSession.remember ? localStorage : sessionStorage
                const otherStorage = nextSession.remember ? sessionStorage : localStorage
                storage.setItem(demoSessionKey, JSON.stringify(nextSession))
                otherStorage.removeItem(demoSessionKey)
              } catch {}
              setSession(nextSession)
            }}
          />
          <footer className="mt-6 text-center text-[11px] text-ink-soft">
            Tâm Trí Sài Gòn · Phiếu chỉ định & Lịch khám
          </footer>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-[calc(66px+env(safe-area-inset-bottom))] md:pb-0 print:pb-0">
      <div className="mx-auto max-w-[1180px] px-4 py-6 md:mr-8 md:ml-[212px] md:max-w-none md:px-8 md:py-10 xl:mr-10">
        <HospitalHeader />
        <nav
          aria-label="Chức năng / Navigation"
          className="no-print fixed inset-x-3 bottom-[calc(8px+env(safe-area-inset-bottom))] z-50 mx-auto flex w-[calc(100%-24px)] max-w-[420px] items-stretch gap-1 rounded-[16px] border border-line bg-white p-1 shadow-[0_6px_20px_rgba(20,33,61,0.18)] md:inset-x-auto md:top-1/2 md:bottom-auto md:left-4 md:m-0 md:w-[180px] md:max-w-none md:-translate-y-1/2 md:flex-col md:gap-1 md:rounded-[20px] md:p-2 md:shadow-[0_12px_32px_rgba(20,33,61,0.16)]"
        >
          {([
            ["prescription", "Phiếu chỉ định", "Prescription"],
            ["appointments", "Lịch khám", "Appointments"],
            ["history", "Lịch sử phiếu", "Order history"],
            ["account", "Tài khoản", "Account"],
          ] as const).map(([id, vi, en]) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`group relative flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-[12px] px-1 py-1.5 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:min-h-[68px] md:w-full md:flex-none md:justify-start md:gap-3 md:px-3 md:py-2 md:text-[13px] ${
                activeTab === id
                  ? "bg-brand-tint text-brand"
                  : "text-ink-soft hover:bg-ground/70 hover:text-brand"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  activeTab === id
                    ? "bg-brand text-white shadow-sm"
                    : "group-hover:bg-brand-tint"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {id === "prescription" ? (
                    <>
                      <rect x="5" y="4" width="14" height="17" rx="2" />
                      <path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3" />
                    </>
                  ) : id === "appointments" ? (
                    <>
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M7 3v4M17 3v4M3 11h18m-14 4 2 2 4-4" />
                    </>
                  ) : id === "history" ? (
                    <>
                      <path d="M3 12a9 9 0 1 0 3-6.7" />
                      <path d="M3 4v5h5M12 7v5l3 2" />
                    </>
                  ) : (
                    <>
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                    </>
                  )}
                </svg>
              </span>
              <span className="hidden text-left md:block">
                <span
                  className={`block whitespace-nowrap ${
                    activeTab === id ? "font-bold" : "font-semibold"
                  }`}
                >
                  {vi}
                </span>
                <span className="mt-0.5 hidden text-[10px] font-normal text-ink-soft sm:block">
                  {en}
                </span>
              </span>
              {activeTab === id && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0.5 h-0.5 w-5 rounded-full bg-brand/70 sm:bottom-1 md:top-1/2 md:bottom-auto md:left-0 md:h-5 md:w-0.5 md:-translate-y-1/2"
                />
              )}
            </button>
          ))}
        </nav>
        <section
          hidden={activeTab !== "account"}
          className="no-print overflow-hidden rounded-lg border border-line bg-white"
        >
          <div className="bg-brand-deep px-5 py-4 text-white">
            <h1 className="text-xl font-extrabold">
              Tài khoản{" "}
              <span className="text-sm font-normal text-white/70">
                / Account
              </span>
            </h1>
          </div>
          <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-tint text-lg font-bold text-brand"
                aria-hidden="true"
              >
                {session.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="text-base font-semibold text-ink">
                  {session.name}
                </p>
                <p className="mt-1 text-xs font-medium text-brand">
                  {session.role === "doctor"
                    ? "Bác sĩ / Doctor"
                    : "Cộng tác viên / Collaborator"}
                </p>
              </div>
            </div>
            <div className="border-t border-line pt-4">
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.removeItem(demoSessionKey)
                    localStorage.removeItem(demoSessionKey)
                  } catch {}
                  setSession(null)
                  setActiveTab("prescription")
                }}
                className="rounded-md border border-line px-4 py-2.5 text-xs font-semibold text-ink-soft hover:border-brand-mid hover:text-brand"
              >
                Đăng xuất / Sign out
              </button>
              <p className="mt-2 text-[11px] text-ink-soft">
                Đăng xuất không xóa phiếu chỉ định hoặc lịch khám đã lưu.
              </p>
            </div>
          </div>
        </section>
        <section
          hidden={activeTab !== "history"}
          className="no-print overflow-hidden rounded-xl border border-line bg-white shadow-sm"
        >
          <div className="bg-gradient-to-r from-brand-deep to-brand px-5 py-4 text-white">
            <h1 className="text-xl font-extrabold">Lịch sử phiếu <span className="text-sm font-normal text-white/70">/ Order history</span></h1>
            <p className="mt-1 text-xs text-white/70">Theo dõi tiến trình các phiếu đã gửi</p>
          </div>
          <div className="p-4 md:p-5">
            {sentOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line py-14 text-center">
                <p className="text-sm font-semibold text-ink-soft">Chưa có phiếu nào được gửi.</p>
                <button type="button" onClick={() => setActiveTab("prescription")} className="mt-3 text-xs font-bold text-brand hover:underline">Tạo phiếu chỉ định</button>
              </div>
            ) : (
              <ul className="grid gap-3">
                {sentOrders.map((order) => (
                  <li key={order.id} className="flex flex-col gap-3 rounded-xl border border-line bg-ground/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-mono text-xs font-bold text-brand">{order.id}</p>
                      <p className="mt-1 text-[11px] text-ink-soft">Đã gửi {new Date(order.sentAt).toLocaleString("vi-VN")}</p>
                    </div>
                    <span className="w-fit rounded-full border border-brand/20 bg-brand-tint px-3 py-1.5 text-xs font-bold text-brand">{order.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <div hidden={activeTab !== "appointments"}>
          <AppointmentTab
            patientName={form.patient.name || ""}
            patientId={form.patient.id || ""}
          />
        </div>
        <div
          className={
            activeTab === "prescription"
              ? "grid gap-5 lg:grid-cols-[1fr_308px]"
              : "hidden"
          }
        >
          <main className="flex flex-col gap-5">
            {/* Title bar */}
            <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-brand-deep to-brand px-5 py-3.5 text-white">
              <h1 className="flex items-baseline gap-2.5">
                <span className="text-xl font-extrabold uppercase tracking-wide">
                  Phiếu chỉ định
                </span>
                <span className="hidden text-[13px] font-medium uppercase tracking-widest text-white/70 sm:inline">
                  Medical Tests Prescription
                </span>
              </h1>
              <span className="hidden font-mono text-[11px] text-white/60 sm:block">
                No. {new Date().getFullYear()}-
                {String(Math.floor(1000 + total * 7)).padStart(4, "0")}
              </span>
            </div>

            {/* Patient information */}
            <section className="rounded-lg border border-line bg-white p-5 shadow-[0_1px_2px_rgba(20,33,61,0.04)]">
              <div className="grid gap-4 md:grid-cols-3">
                {patientFields.map((f) => (
                  <Field
                    key={f.id}
                    vi={f.vi}
                    en={f.en}
                    span={f.span}
                    value={form.patient[f.id] || ""}
                    onChange={(v) => setPatient(f.id, v)}
                  />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-4">
                {([
                  ["bhyt", "BHYT"],
                  ["service", "Dịch Vụ"],
                  ["reexam", "Tái khám / Re-examination"],
                ] as const).map(([key, label]) => (
                  <label
                    key={key}
                    className="group flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink"
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={form.flags[key]}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          flags: { ...f.flags, [key]: !f.flags[key] },
                        }))
                      }
                    />
                    <Check checked={form.flags[key]} />
                    {label}
                  </label>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  {([
                    ["urgent", "Khẩn"],
                    ["normal", "Thường"],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          priority: f.priority === key ? null : key,
                        }))
                      }
                      className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-wide transition-colors ${
                        form.priority === key
                          ? key === "urgent"
                            ? "border-urgent bg-urgent text-white"
                            : "border-ok bg-ok text-white"
                          : "border-line bg-white text-ink-soft hover:border-brand-mid"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-1">
                <label className="text-[12px]">
                  <span className="font-semibold text-ink">
                    Chẩn đoán lâm sàng
                  </span>
                  <span className="text-[11px] text-ink-soft">
                    {" "}
                    / Clinical diagnosis
                  </span>
                </label>
                <textarea
                  rows={2}
                  value={form.diagnosis}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, diagnosis: e.target.value }))
                  }
                  className="resize-none rounded-md border border-line bg-brand-tint/40 px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand-mid focus:bg-white focus:ring-2 focus:ring-brand-mid/20"
                />
              </div>
            </section>

            {/* Search bar */}
            <div className="no-print relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft">
                <svg
                  viewBox="0 0 24 24"
                  className="h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.2-3.2" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm chỉ định… (vd: MRI sọ não, sieu am tim, xoang)"
                className="h-11 w-full rounded-lg border border-line bg-white pl-11 pr-24 text-[14px] text-ink shadow-[0_1px_2px_rgba(20,33,61,0.04)] outline-none transition-colors placeholder:text-ink-soft/50 focus:border-brand-mid focus:ring-2 focus:ring-brand-mid/20"
              />
              {query && (
                <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-2">
                  <span className="font-mono text-[11px] text-ink-soft">
                    {matchCount} kết quả
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-brand-tint hover:text-brand"
                    aria-label="Xóa tìm kiếm"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {query && matchCount === 0 && (
              <div className="rounded-lg border border-dashed border-line bg-white py-10 text-center text-[13px] text-ink-soft">
                Không tìm thấy chỉ định nào khớp với “{query}”.
              </div>
            )}

            <BalancedColumns
              items={[
                ...groups,
                ...labGroups.filter((g) => g.id !== "biochem"),
                ...packages,
              ]}
              cols={3}
              selected={selectedSet}
              toggle={toggle}
              query={query}
              contrast={form.contrast}
              onContrast={setContrastId}
              notes={form.notes}
              setNote={setNote}
            />
            {labGroups
              .filter((g) => g.id === "biochem")
              .map((g) => (
                <Panel
                  key={g.id}
                  group={g}
                  selected={selectedSet}
                  toggle={toggle}
                  query={query}
                  contrast={form.contrast[g.id]}
                  onContrast={() => setContrastId(g.id)}
                  notes={form.notes}
                  setNote={setNote}
                />
              ))}

            {/* Return results */}
            <section className="rounded-lg border border-line bg-white p-5">
              <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-brand">
                Nơi trả kết quả{" "}
                <span className="font-medium text-ink-soft">
                  / Return results
                </span>
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  vi="Email"
                  en="Email"
                  span={3}
                  value={form.returnEmail}
                  onChange={(v) => setForm((f) => ({ ...f, returnEmail: v }))}
                />
                <Field
                  vi="Địa chỉ"
                  en="Address"
                  span={3}
                  value={form.returnAddress}
                  onChange={(v) => setForm((f) => ({ ...f, returnAddress: v }))}
                />
              </div>
            </section>
          </main>

          <aside className="no-print lg:sticky lg:top-6 lg:self-start">
            <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(20,33,61,0.04)]">
              <div className="flex items-center justify-between bg-brand-deep px-4 py-3 text-white">
                <span className="text-[13px] font-bold uppercase tracking-wide">
                  Tóm tắt chỉ định
                </span>
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 font-mono text-[12px] font-semibold text-brand-deep">
                  {total}
                </span>
              </div>
              <div className="max-h-[52vh] overflow-y-auto p-4">
                {summary.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-ink-soft">
                    Chưa chọn chỉ định nào.
                    <br />
                    <span className="text-[12px] text-ink-soft/70">
                      Tích chọn các mục ở bên trái.
                    </span>
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {summary.map((g) => (
                      <li key={g.title}>
                        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand">
                          {g.title}
                          {g.contrast && (
                            <span className="rounded bg-brand-tint px-1.5 py-px text-[10px] text-brand-mid">
                              + cản
                            </span>
                          )}
                        </p>
                        <ul className="flex flex-col gap-0.5 border-l-2 border-brand-tint pl-2.5">
                          {g.items.map((it) => (
                            <li
                              key={it.id}
                              className="text-[12.5px] leading-snug text-ink-soft"
                            >
                              {it.vi}
                              {it.text && (
                                <span className="text-ink">: {it.text}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-col gap-2 border-t border-line p-4">
                <button
                  type="button"
                  onClick={sendResults}
                  disabled={summary.length === 0}
                  className="h-10 rounded-md bg-brand text-[12px] font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft/60"
                >
                  Gửi kết quả
                </button>
                {sendStatus.state !== "idle" && (
                  <p
                    role="status"
                    className={`rounded-md px-3 py-2 text-center text-[11px] font-medium ${
                      sendStatus.state === "sent"
                        ? "bg-brand-tint text-brand"
                        : "bg-red-50 text-urgent"
                    }`}
                  >
                    {sendStatus.message}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, selected: [], contrast: {} }))
                  }
                  className="h-9 rounded-md border border-line text-[12px] font-medium text-ink-soft transition-colors hover:border-brand-mid hover:text-brand"
                >
                  Xóa lựa chọn
                </button>
              </div>
            </div>
          </aside>
        </div>

        <footer className="mt-6 hidden text-center text-[11px] text-ink-soft/70 md:block">
          © {new Date().getFullYear()} TMMC Healthcare · Tâm Trí Sài Gòn General
          Hospital
        </footer>
      </div>
    </div>
  )
}

export default function App() {
  return window.location.pathname === "/admin" ? <AdminPage /> : <PatientApp />
}
