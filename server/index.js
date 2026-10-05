import "dotenv/config"
import bcrypt from "bcryptjs"
import cookieParser from "cookie-parser"
import cors from "cors"
import express from "express"
import helmet from "helmet"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"

const requiredEnvironment = ["MONGODB_URI", "JWT_SECRET"]
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name])
if (missingEnvironment.length) {
  console.error(`Thiếu biến môi trường: ${missingEnvironment.join(", ")}`)
  process.exit(1)
}

const app = express()
const port = Number(process.env.API_PORT || 3001)
const isProduction = process.env.NODE_ENV === "production"

app.disable("x-powered-by")
app.use(helmet())
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:8443", credentials: true }))
app.use(express.json({ limit: "250kb" }))
app.use(cookieParser())

const accountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 30 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: ["admin", "doctor", "collaborator"] },
  active: { type: Boolean, default: true },
}, { timestamps: true })

const submissionSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
  patient: {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    dob: { type: String, trim: true },
    address: { type: String, trim: true, maxlength: 300 },
    telephone: { type: String, trim: true, maxlength: 30 },
    patientId: { type: String, trim: true, maxlength: 50 },
  },
  flags: { type: mongoose.Schema.Types.Mixed, default: {} },
  priority: { type: String, enum: ["urgent", "normal", null], default: null },
  diagnosis: { type: String, trim: true, maxlength: 2000 },
  results: { type: [mongoose.Schema.Types.Mixed], default: [] },
  appointment: { type: mongoose.Schema.Types.Mixed, default: null },
  status: {
    type: String,
    enum: ["submitted", "sales_confirmed", "pdf_ready", "sent_cskh", "checked_in", "in_service", "completed"],
    default: "submitted",
  },
}, { timestamps: true })

const appointmentSchema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
  patientName: { type: String, required: true, trim: true, maxlength: 150 },
  patientId: { type: String, trim: true, maxlength: 50 },
  date: { type: String, required: true },
  time: { type: String, required: true },
  department: { type: String, trim: true, maxlength: 120 },
  note: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true })

const auditSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
  action: { type: String, required: true },
  resourceType: String,
  resourceId: String,
  ip: String,
}, { timestamps: true })

const Account = mongoose.model("Account", accountSchema)
const Submission = mongoose.model("Submission", submissionSchema)
const Appointment = mongoose.model("Appointment", appointmentSchema)
const Audit = mongoose.model("Audit", auditSchema)

const publicAccount = (account) => ({
  id: account._id,
  name: account.name,
  username: account.username,
  role: account.role,
  active: account.active,
  createdAt: account.createdAt,
})

const audit = (request, action, resourceType, resourceId) =>
  Audit.create({ actor: request.user?.id, action, resourceType, resourceId, ip: request.ip }).catch(() => {})

function authenticate(request, response, next) {
  try {
    const token = request.cookies.tmmc_session
    if (!token) return response.status(401).json({ message: "Chưa đăng nhập." })
    request.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    response.status(401).json({ message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." })
  }
}

const allowRoles = (...roles) => (request, response, next) =>
  roles.includes(request.user.role)
    ? next()
    : response.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này." })

app.get("/api/health", (_request, response) => response.json({ ok: true }))

app.post("/api/auth/register", async (request, response, next) => {
  try {
    const { name, username, password, role } = request.body
    const normalizedUsername = String(username || "").trim().toLowerCase()
    if (!name?.trim() || !/^[a-z0-9._-]{3,30}$/.test(normalizedUsername) || String(password || "").length < 8) {
      return response.status(400).json({ message: "Thông tin đăng ký không hợp lệ; mật khẩu cần ít nhất 8 ký tự." })
    }
    if (!["doctor", "collaborator"].includes(role)) {
      return response.status(400).json({ message: "Vai trò không hợp lệ." })
    }
    const exists = await Account.exists({ username: normalizedUsername })
    if (exists) return response.status(409).json({ message: "Tên đăng nhập đã tồn tại." })
    const account = await Account.create({ name: name.trim(), username: normalizedUsername, passwordHash: await bcrypt.hash(password, 12), role })
    response.status(201).json({ account: publicAccount(account) })
  } catch (error) { next(error) }
})

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const account = await Account.findOne({ username: String(request.body.username || "").trim().toLowerCase() }).select("+passwordHash")
    if (!account || !(await bcrypt.compare(String(request.body.password || ""), account.passwordHash))) {
      return response.status(401).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng." })
    }
    if (!account.active) return response.status(403).json({ message: "Tài khoản đã bị khóa." })
    const token = jwt.sign({ id: account._id.toString(), role: account.role }, process.env.JWT_SECRET, { expiresIn: "8h" })
    response.cookie("tmmc_session", token, { httpOnly: true, secure: isProduction, sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 })
    await audit({ ...request, user: { id: account._id } }, "login", "account", account._id.toString())
    response.json({ account: publicAccount(account) })
  } catch (error) { next(error) }
})

app.post("/api/auth/logout", authenticate, (request, response) => {
  response.clearCookie("tmmc_session", { httpOnly: true, secure: isProduction, sameSite: "lax" })
  audit(request, "logout", "account", request.user.id)
  response.status(204).end()
})

app.get("/api/auth/me", authenticate, async (request, response) => {
  const account = await Account.findById(request.user.id)
  if (!account?.active) return response.status(401).json({ message: "Tài khoản không còn hoạt động." })
  response.json({ account: publicAccount(account) })
})

app.get("/api/accounts", authenticate, allowRoles("admin"), async (_request, response) => {
  response.json({ accounts: await Account.find().sort({ createdAt: -1 }) })
})

app.patch("/api/accounts/:id/status", authenticate, allowRoles("admin"), async (request, response) => {
  const account = await Account.findByIdAndUpdate(request.params.id, { active: Boolean(request.body.active) }, { new: true })
  if (!account) return response.status(404).json({ message: "Không tìm thấy tài khoản." })
  await audit(request, "account.status", "account", account._id.toString())
  response.json({ account: publicAccount(account) })
})

app.post("/api/submissions", authenticate, allowRoles("doctor", "collaborator"), async (request, response, next) => {
  try {
    const code = `TTSG-${Date.now().toString(36).toUpperCase()}`
    const submission = await Submission.create({ ...request.body, code, submittedBy: request.user.id, status: "submitted" })
    await audit(request, "submission.create", "submission", submission._id.toString())
    response.status(201).json({ submission })
  } catch (error) { next(error) }
})

app.get("/api/submissions", authenticate, async (request, response) => {
  const query = request.user.role === "admin" ? {} : { submittedBy: request.user.id }
  const submissions = await Submission.find(query).populate("submittedBy", "name username role").sort({ createdAt: -1 }).limit(100)
  response.json({ submissions })
})

app.patch("/api/submissions/:id/status", authenticate, allowRoles("admin"), async (request, response) => {
  const submission = await Submission.findByIdAndUpdate(request.params.id, { status: request.body.status }, { new: true, runValidators: true })
  if (!submission) return response.status(404).json({ message: "Không tìm thấy phiếu." })
  await audit(request, "submission.status", "submission", submission._id.toString())
  response.json({ submission })
})

app.post("/api/appointments", authenticate, allowRoles("doctor", "collaborator"), async (request, response, next) => {
  try {
    const appointment = await Appointment.create({ ...request.body, createdBy: request.user.id })
    await audit(request, "appointment.create", "appointment", appointment._id.toString())
    response.status(201).json({ appointment })
  } catch (error) { next(error) }
})

app.get("/api/appointments", authenticate, async (request, response) => {
  const query = request.user.role === "admin" ? {} : { createdBy: request.user.id }
  response.json({ appointments: await Appointment.find(query).sort({ date: 1, time: 1 }) })
})

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(error?.name === "ValidationError" ? 400 : 500).json({ message: "Không thể xử lý yêu cầu." })
})

async function start() {
  await mongoose.connect(process.env.MONGODB_URI)
  const adminUsername = (process.env.ADMIN_USERNAME || "admin").toLowerCase()
  if (!(await Account.exists({ username: adminUsername }))) {
    await Account.create({
      name: "Quản trị hệ thống",
      username: adminUsername,
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || "Admin@123", 12),
      role: "admin",
      active: true,
    })
    console.log(`Đã tạo tài khoản quản trị: ${adminUsername}`)
  }
  app.listen(port, () => console.log(`API đang chạy tại http://localhost:${port}`))
}

start().catch((error) => {
  console.error("Không thể khởi động API:", error.message)
  process.exit(1)
})
