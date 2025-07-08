import express from "express"
import chalk from "chalk"
import fs from "fs"
import cors from "cors"
import path from "path"
import { fileURLToPath, pathToFileURL } from "url"
import { createRequire } from "module"

// Path settings
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

const app = express()
const PORT = process.env.PORT || 4000
const settingsPath = path.join(__dirname, "src", "settings.json")

// Middleware config
app.enable("trust proxy")
app.set("json spaces", 2)
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cors())

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("X-XSS-Protection", "1; mode=block")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  next()
})

// Rate limiting
const requestCounts = new Map()
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 15

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress
  const now = Date.now()

  const entry = requestCounts.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW }

  if (now > entry.resetTime) {
    entry.count = 1
    entry.resetTime = now + RATE_LIMIT_WINDOW
  } else {
    entry.count++
    if (entry.count > RATE_LIMIT_MAX) {
      return res.status(429).sendFile(path.join(__dirname, "api-page", "429.html"))
    }
  }

  requestCounts.set(ip, entry)
  next()
})

setInterval(() => {
  const now = Date.now()
  for (const [ip, data] of requestCounts) {
    if (now > data.resetTime) requestCounts.delete(ip)
  }
}, RATE_LIMIT_WINDOW)

// Maintenance Mode
app.use((req, res, next) => {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"))
    const skipPaths = ["/api/settings", "/assets/", "/src/", "/api/preview-image"]
    const shouldSkip = skipPaths.some((p) => req.path.startsWith(p))

    if (settings.maintenance?.enabled && !shouldSkip) {
      if (req.path.startsWith("/api/") || req.path.startsWith("/ai/")) {
        return res.status(503).json({
          status: false,
          message: "API sedang dalam pemeliharaan. Silakan coba lagi nanti.",
          maintenance: true,
          creator: settings.apiSettings?.creator || "ThonAPI Team",
        })
      }
      return res.status(503).sendFile(path.join(__dirname, "api-page", "maintenance.html"))
    }

    next()
  } catch (err) {
    console.error("Gagal membaca settings.json:", err)
    next()
  }
})

// Assets: CSS dan JS
app.get("/assets/:file", (req, res) => {
  const file = req.params.file
  const filePath = path.join(__dirname, "api-page", file)
  if (file.endsWith(".css")) {
    res.setHeader("Content-Type", "text/css")
  } else if (file.endsWith(".js")) {
    res.setHeader("Content-Type", "application/javascript")
  }
  res.sendFile(filePath)
})

// Preview image (fallback sistematik)
app.get("/api/preview-image", (req, res) => {
  const candidates = ["preview.png", "banner.jpg", "icon.png"]
  for (const file of candidates) {
    const filePath = path.join(__dirname, "src", file)
    if (fs.existsSync(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=86400")
      res.setHeader("Content-Type", file.endsWith(".jpg") ? "image/jpeg" : "image/png")
      return res.sendFile(filePath)
    }
  }
  res.status(404).json({ error: "Preview image not found" })
})

// API - Settings dan Notifications
app.get("/api/settings", (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"))
    res.json(settings)
  } catch (err) {
    res.status(500).sendFile(path.join(__dirname, "api-page", "500.html"))
  }
})

app.get("/api/notifications", (req, res) => {
  try {
    const notif = JSON.parse(fs.readFileSync(path.join(__dirname, "api-page", "notifications.json"), "utf-8"))
    res.json(notif)
  } catch (err) {
    res.status(500).sendFile(path.join(__dirname, "api-page", "500.html"))
  }
})

// Block akses file sensitif
app.use((req, res, next) => {
  const blocked = [
    "/api-page/",
    "/src/settings.json",
    "/api-page/notifications.json",
    "/api-page/styles.css",
    "/api-page/script.js",
  ]
  const isBlocked = blocked.some((b) => req.path.startsWith(b) || req.path === b)
  if (isBlocked) return res.status(403).sendFile(path.join(__dirname, "api-page", "403.html"))
  next()
})

// Serve gambar dari /src (dengan filter)
app.use("/src", (req, res, next) => {
  if (req.path.match(/\.(jpg|jpeg|png|gif|svg|ico)$/i)) {
    return express.static(path.join(__dirname, "src"))(req, res, next)
  }
  return res.status(403).sendFile(path.join(__dirname, "api-page", "403.html"))
})

// JSON Global Middleware
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"))
app.use((req, res, next) => {
  const originalJson = res.json
  res.json = function (data) {
    const response = {
      status: data?.status ?? true,
      creator: settings.apiSettings?.creator || "ThonAPI Team",
      ...data,
    }
    return originalJson.call(this, response)
  }
  next()
})

// Dynamic Route Loader
let totalRoutes = 0
const apiFolder = path.join(__dirname, "src", "api")

const loadRoutes = async () => {
  const folders = fs.readdirSync(apiFolder)
  for (const folder of folders) {
    const folderPath = path.join(apiFolder, folder)
    if (!fs.statSync(folderPath).isDirectory()) continue

    const files = fs.readdirSync(folderPath)
    for (const file of files) {
      const filePath = path.join(folderPath, file)
      if (path.extname(file) !== ".js") continue

      try {
        const module = await import(pathToFileURL(filePath).href)
        if (typeof module.default === "function") {
          module.default(app)
          totalRoutes++
          console.log(chalk.bgHex("#fff59d").hex("#333").bold(` Loaded: ${file} `))
        }
      } catch (err) {
        console.error(`Gagal load route ${file}:`, err)
      }
    }
  }
}

await loadRoutes()

// Root endpoint
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "api-page", "index.html"))
})

// 404 & Error Pages
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "api-page", "404.html"))
})

app.use((err, req, res, next) => {
  console.error(err.stack)
  const code = err.status || 500
  const known = [400, 401, 403, 405, 408, 429, 502, 503]
  const file = known.includes(code) ? `${code}.html` : "500.html"
  res.status(code).sendFile(path.join(__dirname, "api-page", file))
})

// Server Start
app.listen(PORT, () => {
  console.log(chalk.bgHex("#a3f7b5").hex("#222").bold(` ThonAPI Server running on port ${PORT} `))
  console.log(chalk.bgHex("#c0ebff").hex("#222").bold(` Total Routes Loaded: ${totalRoutes} `))
})

export default app
