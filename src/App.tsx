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

type AppTab = "prescription" | "appointments" | "history" | "account"

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

const tabMeta: Record<AppTab, { title: string; short: string }> = {
  prescription: { title: "Phiếu chỉ định", short: "Phiếu" },
  appointments: { title: "Lịch khám", short: "Lịch" },
  history: { title: "Lịch sử phiếu", short: "Lịch sử" },
  account: { title: "Tài khoản", short: "Tài khoản" },
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
  s
    .toLowerCase()
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
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
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

function TabIcon({ id }: { id: AppTab }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
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
    <section className="overflow-hidden rounded-2xl border border-line bg-white/95">
      <header className="flex items-center gap-2 bg-brand px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 flex-1 items-center gap-2 text-left text-white"
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
          <span className="text-[13px] font-bold uppercase tracking-wide">
            {group.vi}
          </span>
          {count > 0 && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 font-mono text-[11px] font-semibold text-brand">
              {count}
            </span>
          )}
        </button>
        {group.toggle && (
          <button
            type="button"
            onClick={onContrast}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              contrast
                ? "bg-white text-brand"
                : "bg-white/15 text-white"
            }`}
          >
            <Check checked={!!contrast} />
            {group.toggle.vi}
          </button>
        )}
      </header>
      <div className={`p-3.5 ${expanded ? "" : "hidden"}`}>
        <ul className="grid grid-cols-1 gap-y-2">
          {visible.map((c) => {
            const on = selected.has(c.id)
            return (
              <li key={c.id}>
                <label className="group flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 py-1 text-[14px] leading-snug">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => toggle(c.id)}
                  />
                  <Check checked={on} />
                  <span className={on ? "font-medium text-ink" : "text-ink-soft"}>
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
                    className="app-input ml-8 mt-1 w-[calc(100%-2rem)] px-3.5"
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
  value,
  onChange,
}: {
  vi: string
  en?: string
  span?: number
  value: string
  onChange?: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-ink">{vi}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="app-input px-3.5"
      />
    </div>
  )
}

function PatientApp() {
  const [session, setSession] = useState<DemoSession | null>(loadDemoSession)
  const [activeTab, setActiveTab] = useState<AppTab>("prescription")
  const [summaryOpen, setSummaryOpen] = useState(false)
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
      const statuses = JSON.parse(
        localStorage.getItem(ADMIN_STATUSES_KEY) || "{}",
      )
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
      setSummaryOpen(true)
      return
    }

    try {
      const sentAt = new Date()
      const submissionId = `TTSG-${sentAt.getTime().toString(36).toUpperCase()}`
      const saved = JSON.parse(localStorage.getItem(SENT_RESULTS_KEY) || "[]")
      const history = Array.isArray(saved) ? saved : []
      const appointments = JSON.parse(
        localStorage.getItem(APPOINTMENTS_KEY) || "[]",
      )
      const appointment = Array.isArray(appointments)
        ? appointments
            .filter(
              (item) =>
                item.patientId === form.patient.id ||
                item.patientName?.trim().toLowerCase() ===
                  form.patient.name.trim().toLowerCase(),
            )
            .sort((a, b) =>
              `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
            )[0] || null
        : null
      history.unshift({
        id: submissionId,
        sentAt: sentAt.toISOString(),
        submittedBy: {
          name: session!.name,
          username: session!.username,
          role: session!.role,
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
      localStorage.setItem(
        SENT_RESULTS_KEY,
        JSON.stringify(history.slice(0, 100)),
      )
      const statuses = JSON.parse(
        localStorage.getItem(ADMIN_STATUSES_KEY) || "{}",
      )
      localStorage.setItem(
        ADMIN_STATUSES_KEY,
        JSON.stringify({ ...statuses, [submissionId]: "submitted" }),
      )
      const notifications = JSON.parse(
        localStorage.getItem(NOTIFICATIONS_KEY) || "[]",
      )
      const notificationHistory = Array.isArray(notifications)
        ? notifications
        : []
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
        message: `Đã gửi · Mã ${submissionId}`,
      })
      setSummaryOpen(false)
    } catch {
      setSendStatus({
        state: "error",
        message: "Không thể gửi phiếu. Vui lòng thử lại.",
      })
    }
  }

  if (!session) {
    return (
      <DemoLogin
        onLogin={(nextSession) => {
          try {
            const storage = nextSession.remember
              ? localStorage
              : sessionStorage
            const otherStorage = nextSession.remember
              ? sessionStorage
              : localStorage
            storage.setItem(demoSessionKey, JSON.stringify(nextSession))
            otherStorage.removeItem(demoSessionKey)
          } catch {}
          setSession(nextSession)
        }}
      />
    )
  }

  const prescriptionGroups = [
    ...groups,
    ...labGroups.filter((g) => g.id !== "biochem"),
    ...packages,
    ...labGroups.filter((g) => g.id === "biochem"),
  ]

  return (
    <div className="app-screen">
      <header className="app-topbar">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-mid">
              Tâm Trí
            </p>
            <h1 className="truncate text-lg font-extrabold text-ink">
              {tabMeta[activeTab].title}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("account")}
            className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3"
            aria-label="Mở tài khoản"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
              {session.name.charAt(0).toUpperCase()}
            </span>
            <span className="max-w-[72px] truncate text-xs font-semibold text-ink">
              {session.name.split(" ").slice(-1)[0]}
            </span>
          </button>
        </div>
      </header>

      <main className="app-content px-4 pt-4">
        <div
          hidden={activeTab !== "account"}
          className="app-fade space-y-4"
        >
          <section className="rounded-2xl border border-line bg-white/95 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-xl font-bold text-white">
                {session.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold text-ink">
                  {session.name}
                </p>
                <p className="mt-1 text-sm font-medium text-brand">
                  {session.role === "doctor" ? "Bác sĩ" : "Cộng tác viên"}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                  @{session.username}
                </p>
              </div>
            </div>
          </section>
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
            className="app-btn w-full border border-line bg-white text-ink-soft"
          >
            Đăng xuất
          </button>
          <p className="text-center text-[11px] text-ink-soft">
            Đăng xuất không xóa phiếu hoặc lịch đã lưu trên máy.
          </p>
        </div>

        <div
          hidden={activeTab !== "history"}
          className="app-fade space-y-3"
        >
          {sentOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white/80 px-4 py-14 text-center">
              <p className="text-sm font-semibold text-ink-soft">
                Chưa có phiếu nào được gửi.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("prescription")}
                className="mt-3 text-sm font-bold text-brand"
              >
                Tạo phiếu chỉ định
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {sentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-brand">
                      {order.id}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-soft">
                      {new Date(order.sentAt).toLocaleString("vi-VN")}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-brand-tint px-2.5 py-1.5 text-[11px] font-bold text-brand">
                    {order.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div hidden={activeTab !== "appointments"} className="app-fade">
          <AppointmentTab
            patientName={form.patient.name || ""}
            patientId={form.patient.id || ""}
          />
        </div>

        <div
          hidden={activeTab !== "prescription"}
          className="app-fade space-y-4 pb-28"
        >
          <section className="rounded-2xl border border-line bg-white/95 p-4">
            <h2 className="mb-3 text-sm font-extrabold text-ink">
              Thông tin bệnh nhân
            </h2>
            <div className="grid gap-3">
              {patientFields.map((f) => (
                <Field
                  key={f.id}
                  vi={f.vi}
                  value={form.patient[f.id] || ""}
                  onChange={(v) => setPatient(f.id, v)}
                />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              {(
                [
                  ["bhyt", "BHYT"],
                  ["service", "Dịch vụ"],
                  ["reexam", "Tái khám"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold ${
                    form.flags[key]
                      ? "border-brand bg-brand-tint text-brand"
                      : "border-line bg-white text-ink-soft"
                  }`}
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
            </div>

            <div className="mt-3 flex gap-2">
              {(
                [
                  ["urgent", "Khẩn"],
                  ["normal", "Thường"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      priority: f.priority === key ? null : key,
                    }))
                  }
                  className={`min-h-10 flex-1 rounded-xl border text-[13px] font-bold transition-colors ${
                    form.priority === key
                      ? key === "urgent"
                        ? "border-urgent bg-urgent text-white"
                        : "border-ok bg-ok text-white"
                      : "border-line bg-white text-ink-soft"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-ink">
                Chẩn đoán lâm sàng
              </label>
              <textarea
                rows={3}
                value={form.diagnosis}
                onChange={(e) =>
                  setForm((f) => ({ ...f, diagnosis: e.target.value }))
                }
                className="resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none focus:border-brand-mid focus:ring-2 focus:ring-brand-mid/20"
              />
            </div>
          </section>

          <div className="sticky top-[calc(env(safe-area-inset-top)+64px)] z-20">
            <div className="relative">
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
                placeholder="Tìm chỉ định…"
                className="h-11 w-full rounded-xl border border-line bg-white/95 pl-11 pr-20 text-[15px] text-ink shadow-sm outline-none placeholder:text-ink-soft/50 focus:border-brand-mid focus:ring-2 focus:ring-brand-mid/20"
              />
              {query && (
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                  <span className="font-mono text-[10px] text-ink-soft">
                    {matchCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft"
                    aria-label="Xóa tìm kiếm"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>

          {query && matchCount === 0 && (
            <div className="rounded-2xl border border-dashed border-line bg-white/80 py-10 text-center text-[13px] text-ink-soft">
              Không tìm thấy chỉ định khớp “{query}”.
            </div>
          )}

          <div className="flex flex-col gap-3">
            {prescriptionGroups.map((g) => (
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
          </div>

          <section className="rounded-2xl border border-line bg-white/95 p-4">
            <h3 className="mb-3 text-sm font-extrabold text-ink">
              Nơi trả kết quả
            </h3>
            <div className="grid gap-3">
              <Field
                vi="Email"
                value={form.returnEmail}
                onChange={(v) => setForm((f) => ({ ...f, returnEmail: v }))}
              />
              <Field
                vi="Địa chỉ"
                value={form.returnAddress}
                onChange={(v) => setForm((f) => ({ ...f, returnAddress: v }))}
              />
            </div>
          </section>

          <div className="app-action-bar no-print p-3">
            <button
              type="button"
              onClick={() => setSummaryOpen((open) => !open)}
              className="mb-2 flex w-full items-center justify-between rounded-xl bg-brand-tint px-3 py-2.5 text-left"
            >
              <span className="text-sm font-bold text-brand">
                Tóm tắt · {total} chỉ định
              </span>
              <span className="text-xs font-semibold text-brand-mid">
                {summaryOpen ? "Thu gọn" : "Xem"}
              </span>
            </button>

            {summaryOpen && (
              <div className="mb-3 max-h-40 overflow-y-auto rounded-xl border border-line bg-white p-3">
                {summary.length === 0 ? (
                  <p className="py-4 text-center text-xs text-ink-soft">
                    Chưa chọn chỉ định nào.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {summary.map((g) => (
                      <li key={g.title}>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-brand">
                          {g.title}
                          {g.contrast ? " · +cản" : ""}
                        </p>
                        <ul className="mt-1 space-y-0.5 pl-2">
                          {g.items.map((it) => (
                            <li
                              key={it.id}
                              className="text-[12px] text-ink-soft"
                            >
                              {it.vi}
                              {it.text ? `: ${it.text}` : ""}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {sendStatus.state !== "idle" && (
              <p
                role="status"
                className={`mb-2 rounded-xl px-3 py-2 text-center text-[11px] font-medium ${
                  sendStatus.state === "sent"
                    ? "bg-brand-tint text-brand"
                    : "bg-red-50 text-urgent"
                }`}
              >
                {sendStatus.message}
              </p>
            )}

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={sendResults}
                disabled={summary.length === 0}
                className="app-btn app-btn-primary"
              >
                Gửi kết quả
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, selected: [], contrast: {} }))
                }
                className="app-btn border border-line bg-white px-4 text-ink-soft"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      </main>

      <nav aria-label="Điều hướng" className="app-tabbar no-print">
        {(
          [
            "prescription",
            "appointments",
            "history",
            "account",
          ] as const
        ).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeTab === id}
            onClick={() => setActiveTab(id)}
            className="app-tab"
          >
            <TabIcon id={id} />
            <span className="text-[10px] font-semibold leading-none">
              {tabMeta[id].short}
            </span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return window.location.pathname === "/admin" ? <AdminPage /> : <PatientApp />
}
