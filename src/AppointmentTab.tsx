import { useEffect, useMemo, useState } from "react"
import { subscribeSync } from "./sync"

type Appointment = {
  id: string
  patientName: string
  patientId: string
  date: string
  time: string
  department: string
  note: string
}

type QueueStatus = "waiting" | "in_progress" | "done"
type FilterStatus = "all" | QueueStatus

const appointmentsKey = "tmmc-appointments"
const submissionsKey = "tmmc-sent-results"
const statusesKey = "tmmc-admin-statuses"

const statusConfig: Record<QueueStatus, { label: string; className: string; dot: string }> = {
  waiting: {
    label: "Đang chờ khám",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  in_progress: {
    label: "Đang khám",
    className: "border-blue-200 bg-blue-50 text-brand",
    dot: "bg-brand-mid",
  },
  done: {
    label: "Khám xong",
    className: "border-green-200 bg-green-50 text-ok",
    dot: "bg-ok",
  },
}

function readArray(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]")
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function loadQueue(): Array<Appointment & { status: QueueStatus }> {
  const appointments = readArray(appointmentsKey) as Appointment[]
  const submissions = readArray(submissionsKey)
  let statuses: Record<string, string> = {}
  try {
    statuses = JSON.parse(localStorage.getItem(statusesKey) || "{}")
  } catch {
    // Keep empty statuses.
  }

  const toQueueStatus = (workflowStatus?: string): QueueStatus =>
    workflowStatus === "completed"
      ? "done"
      : workflowStatus === "in_service"
        ? "in_progress"
        : "waiting"

  const linkedAppointmentIds = new Set<string>()
  const submissionQueue = submissions.map((submission) => {
    const linkedAppointment =
      appointments.find(
        (appointment) =>
          appointment.id === submission.appointment?.id ||
          (submission.patient?.id &&
            appointment.patientId === submission.patient.id),
      ) || submission.appointment
    if (linkedAppointment?.id) linkedAppointmentIds.add(linkedAppointment.id)

    const sentAt = new Date(submission.sentAt || Date.now())
    const fallbackDate = `${sentAt.getFullYear()}-${String(sentAt.getMonth() + 1).padStart(2, "0")}-${String(sentAt.getDate()).padStart(2, "0")}`
    const fallbackTime = `${String(sentAt.getHours()).padStart(2, "0")}:${String(sentAt.getMinutes()).padStart(2, "0")}`
    return {
      id: linkedAppointment?.id || submission.id,
      patientName: submission.patient?.name || linkedAppointment?.patientName || "Chưa nhập tên",
      patientId: submission.patient?.id || linkedAppointment?.patientId || "",
      date: linkedAppointment?.date || fallbackDate,
      time: linkedAppointment?.time || fallbackTime,
      department: linkedAppointment?.department || "Chưa phân khoa",
      note: linkedAppointment?.note || submission.diagnosis || "",
      status: toQueueStatus(statuses[submission.id]),
    }
  })

  const unlinkedAppointments = appointments
    .filter((appointment) => !linkedAppointmentIds.has(appointment.id))
    .map((appointment) => ({ ...appointment, status: "waiting" as QueueStatus }))

  return [...submissionQueue, ...unlinkedAppointments]
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
}

export default function AppointmentTab(_: {
  patientName: string
  patientId: string
}) {
  const [queue, setQueue] = useState(loadQueue)
  const [filter, setFilter] = useState<FilterStatus>("all")
  const refresh = () => setQueue(loadQueue())

  useEffect(() => {
    const unsubscribe = subscribeSync(() => refresh())
    window.addEventListener("focus", refresh)
    return () => {
      unsubscribe()
      window.removeEventListener("focus", refresh)
    }
  }, [])

  const counts = useMemo(
    () => ({
      waiting: queue.filter((item) => item.status === "waiting").length,
      in_progress: queue.filter((item) => item.status === "in_progress").length,
      done: queue.filter((item) => item.status === "done").length,
    }),
    [queue],
  )
  const visibleQueue = queue.filter((item) => {
    if (filter !== "all" && item.status !== filter) return false
    return true
  })

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <div className="flex flex-col gap-2 bg-gradient-to-r from-brand-deep to-brand px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold">Theo dõi khám <span className="text-sm font-normal text-white/70">/ Visit queue</span></h1>
          <p className="mt-1 text-xs text-white/70">Trạng thái tiếp nhận và thực hiện dịch vụ</p>
        </div>
        <span className="w-fit rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">{queue.length} bệnh nhân</span>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-line bg-ground/40 p-3 sm:gap-3 sm:p-4">
        {(Object.keys(statusConfig) as QueueStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(filter === status ? "all" : status)}
            className={`flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 text-center transition-all sm:flex-row sm:justify-between sm:p-4 sm:text-left ${statusConfig[status].className} ${filter === status ? "ring-2 ring-brand/20" : "hover:-translate-y-0.5"}`}
          >
            <span className="flex min-w-0 items-center justify-center gap-1.5 text-[10px] font-bold leading-tight sm:justify-start sm:gap-2 sm:text-xs"><span className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${statusConfig[status].dot}`} /><span>{statusConfig[status].label}</span></span>
            <span className="font-mono text-xl font-extrabold sm:text-2xl">{counts[status]}</span>
          </button>
        ))}
      </div>

      <div className="p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink">Danh sách bệnh nhân</h2>
            <p className="mt-1 text-[11px] text-ink-soft">{filter === "all" ? "Tất cả trạng thái" : statusConfig[filter].label}</p>
          </div>
          {filter !== "all" && <button type="button" onClick={() => setFilter("all")} className="text-xs font-semibold text-brand hover:underline">Xem tất cả</button>}
        </div>

        {visibleQueue.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line py-14 text-center">
            <p className="text-sm font-semibold text-ink-soft">Chưa có bệnh nhân trong trạng thái này.</p>
            <p className="mt-1 text-xs text-ink-soft/70">Lịch khám và trạng thái sẽ được đồng bộ từ hệ thống quản trị.</p>
          </div>
        ) : (
          <>
          <div className="grid gap-3 sm:hidden">
            {visibleQueue.map((appointment) => (
              <article key={appointment.id} className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(20,33,61,0.04)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-ink">{appointment.patientName}</p>
                    <p className="mt-1 font-mono text-[11px] text-ink-soft">Mã BN: {appointment.patientId || "—"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-base font-extrabold text-brand">{appointment.time}</p>
                    <p className="mt-0.5 text-[10px] text-ink-soft">{appointment.date}</p>
                  </div>
                </div>
                <div className="my-3 h-px bg-line" />
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Chuyên khoa</p>
                    <p className="mt-1 truncate text-xs font-semibold text-ink">{appointment.department || "Chưa phân khoa"}</p>
                    {appointment.note && <p className="mt-1 line-clamp-2 text-[11px] text-ink-soft">{appointment.note}</p>}
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${statusConfig[appointment.status].className}`}><span className={`h-2 w-2 rounded-full ${statusConfig[appointment.status].dot}`} />{statusConfig[appointment.status].label}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-lg border border-line sm:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-ground/70 text-[11px] uppercase tracking-wide text-ink-soft">
                <tr><th className="px-4 py-3">Giờ khám</th><th className="px-4 py-3">Bệnh nhân</th><th className="px-4 py-3">Mã BN</th><th className="px-4 py-3">Chuyên khoa</th><th className="px-4 py-3">Trạng thái</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visibleQueue.map((appointment) => (
                  <tr key={appointment.id} className="hover:bg-ground/30">
                    <td className="px-4 py-4"><p className="font-mono font-bold text-brand">{appointment.time}</p><p className="mt-1 text-[11px] text-ink-soft">{appointment.date}</p></td>
                    <td className="px-4 py-4"><p className="font-bold text-ink">{appointment.patientName}</p>{appointment.note && <p className="mt-1 text-xs text-ink-soft">{appointment.note}</p>}</td>
                    <td className="px-4 py-4 font-mono text-xs text-ink-soft">{appointment.patientId || "—"}</td>
                    <td className="px-4 py-4 text-ink-soft">{appointment.department || "Chưa phân khoa"}</td>
                    <td className="px-4 py-4"><span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${statusConfig[appointment.status].className}`}><span className={`h-2 w-2 rounded-full ${statusConfig[appointment.status].dot}`} />{statusConfig[appointment.status].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </section>
  )
}
