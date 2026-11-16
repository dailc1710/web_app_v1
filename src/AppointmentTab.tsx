import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
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

const statusConfig: Record<
  QueueStatus,
  { label: string; className: string; dot: string }
> = {
  waiting: {
    label: "Đang chờ",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  in_progress: {
    label: "Đang khám",
    className: "border-blue-200 bg-blue-50 text-brand",
    dot: "bg-brand-mid",
  },
  done: {
    label: "Xong",
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
      patientName:
        submission.patient?.name ||
        linkedAppointment?.patientName ||
        "Chưa nhập tên",
      patientId:
        submission.patient?.id || linkedAppointment?.patientId || "",
      date: linkedAppointment?.date || fallbackDate,
      time: linkedAppointment?.time || fallbackTime,
      department: linkedAppointment?.department || "Chưa phân khoa",
      note: linkedAppointment?.note || submission.diagnosis || "",
      status: toQueueStatus(statuses[submission.id]),
    }
  })

  const unlinkedAppointments = appointments
    .filter((appointment) => !linkedAppointmentIds.has(appointment.id))
    .map((appointment) => ({
      ...appointment,
      status: "waiting" as QueueStatus,
    }))

  return [...submissionQueue, ...unlinkedAppointments].sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
  )
}

function useChipDragScroll(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let dragging = false
    let moved = false
    let startX = 0
    let startScroll = 0

    const onPointerDown = (event: PointerEvent) => {
      dragging = true
      moved = false
      startX = event.clientX
      startScroll = el.scrollLeft
      el.classList.add("is-dragging")
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      const delta = event.clientX - startX
      if (Math.abs(delta) > 6) moved = true
      el.scrollLeft = startScroll - delta
    }

    const stop = () => {
      dragging = false
      el.classList.remove("is-dragging")
    }

    const onClickCapture = (event: MouseEvent) => {
      if (!moved) return
      event.preventDefault()
      event.stopPropagation()
      moved = false
    }

    el.addEventListener("pointerdown", onPointerDown)
    el.addEventListener("pointermove", onPointerMove)
    el.addEventListener("pointerup", stop)
    el.addEventListener("pointercancel", stop)
    el.addEventListener("pointerleave", stop)
    el.addEventListener("click", onClickCapture, true)

    return () => {
      el.removeEventListener("pointerdown", onPointerDown)
      el.removeEventListener("pointermove", onPointerMove)
      el.removeEventListener("pointerup", stop)
      el.removeEventListener("pointercancel", stop)
      el.removeEventListener("pointerleave", stop)
      el.removeEventListener("click", onClickCapture, true)
    }
  }, [ref])
}

export default function AppointmentTab(_: {
  patientName: string
  patientId: string
}) {
  const [queue, setQueue] = useState(loadQueue)
  const [filter, setFilter] = useState<FilterStatus>("all")
  const chipRef = useRef<HTMLDivElement>(null)
  useChipDragScroll(chipRef)
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
    <section className="space-y-3">
      <div className="flex items-center justify-between px-0.5 lg:mb-1">
        <p className="text-sm text-ink-soft">
          {queue.length} bệnh nhân trong hàng đợi
        </p>
        {filter !== "all" && (
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="text-xs font-bold text-brand"
          >
            Xem tất cả
          </button>
        )}
      </div>

      <div ref={chipRef} className="chip-scroll -mx-1 mt-1 px-1">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`inline-flex h-10 shrink-0 items-center justify-center rounded-full border px-3.5 text-xs font-bold leading-none transition-colors ${
            filter === "all"
              ? "border-brand bg-brand text-white shadow-[0_0_0_3px_rgba(27,58,143,0.12)]"
              : "border-line bg-white text-ink-soft"
          }`}
        >
          Tất cả · {queue.length}
        </button>
        {(Object.keys(statusConfig) as QueueStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() =>
              setFilter(filter === status ? "all" : status)
            }
            className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border px-3.5 text-xs font-bold leading-none transition-colors ${
              filter === status
                ? `${statusConfig[status].className} shadow-[0_0_0_3px_rgba(27,58,143,0.12)]`
                : "border-line bg-white text-ink-soft"
            }`}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${statusConfig[status].dot}`}
            />
            {statusConfig[status].label} · {counts[status]}
          </button>
        ))}
      </div>

      {visibleQueue.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white/80 py-14 text-center">
          <p className="text-sm font-semibold text-ink-soft">
            Chưa có bệnh nhân trong trạng thái này.
          </p>
          <p className="mt-1 text-xs text-ink-soft/70">
            Lịch và trạng thái sẽ đồng bộ khi có phiếu mới.
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5">
          {visibleQueue.map((appointment) => (
            <article
              key={appointment.id}
              className="rounded-2xl border border-line bg-white/95 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-extrabold text-ink">
                    {appointment.patientName}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">
                    {appointment.patientId || "Chưa có mã BN"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-lg font-extrabold text-brand">
                    {appointment.time}
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-soft">
                    {appointment.date}
                  </p>
                </div>
              </div>
              <div className="my-3 h-px bg-line" />
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                    Chuyên khoa
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-ink">
                    {appointment.department || "Chưa phân khoa"}
                  </p>
                  {appointment.note && (
                    <p className="mt-1 line-clamp-2 text-[12px] text-ink-soft">
                      {appointment.note}
                    </p>
                  )}
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${statusConfig[appointment.status].className}`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${statusConfig[appointment.status].dot}`}
                  />
                  {statusConfig[appointment.status].label}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
