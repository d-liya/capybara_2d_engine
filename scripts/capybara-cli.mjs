#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

const CAPYBARA_REMOTE = "capybara"
const SYNC_STATUS_PATH = path.join(root, ".capybara", "sync-status.json")
const CONFLICT_EXIT_CODE = 2

const loadEnvFile = () => {
  const envPath = path.join(root, ".env")
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile()

const apiKey = process.env.CAPYBARA_API_KEY?.trim()
const chatId = process.env.CAPYBARA_CHAT_ID?.trim()
const apiUrl = (
  process.env.CAPYBARA_API_URL || "https://www.capybara.build"
).replace(/\/$/, "")

const fail = (message, code = 1) => {
  console.error(message)
  process.exit(code)
}

if (!apiKey) fail("Missing CAPYBARA_API_KEY in .env")
if (!chatId) fail("Missing CAPYBARA_CHAT_ID in .env")

const runResult = (command, args, options = {}) =>
  spawnSync(command, args, {
    cwd: root,
    shell: false,
    ...options,
  })

const run = (command, args, options = {}) => {
  const result = runResult(command, args, { stdio: "inherit", ...options })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const runCapture = (command, args, { allowFail = false } = {}) => {
  const result = runResult(command, args, { encoding: "utf8" })
  const stdout = (result.stdout || "").trim()
  const stderr = (result.stderr || "").trim()
  if (result.status !== 0) {
    if (allowFail) {
      return { ok: false, stdout, stderr, status: result.status ?? 1 }
    }
    fail(stderr || stdout || `${command} ${args.join(" ")} failed`)
  }
  return allowFail
    ? { ok: true, stdout, stderr, status: 0 }
    : stdout
}

const apiFetch = async (pathname, init = {}) => {
  const response = await fetch(`${apiUrl}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers || {}),
    },
  })
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { message: text }
  }
  if (!response.ok) {
    fail(body?.message || `Request failed (${response.status})`)
  }
  return body
}

const ensureCommit = () => {
  const status = runCapture("git", ["status", "--porcelain"])
  if (!status) return false
  run("git", ["add", "-A"])
  run("git", [
    "-c",
    "user.name=Capybara Local",
    "-c",
    "user.email=local@capybara.build",
    "commit",
    "-m",
    `Sync from local ${new Date().toISOString()}`,
  ])
  return true
}

const clearSyncStatus = () => {
  if (existsSync(SYNC_STATUS_PATH)) {
    try {
      unlinkSync(SYNC_STATUS_PATH)
    } catch {
      // ignore
    }
  }
}

const writeSyncStatus = (payload) => {
  mkdirSync(path.dirname(SYNC_STATUS_PATH), { recursive: true })
  writeFileSync(SYNC_STATUS_PATH, `${JSON.stringify(payload, null, 2)}\n`)
}

const listConflictedFiles = () => {
  const result = runCapture("git", ["diff", "--name-only", "--diff-filter=U"], {
    allowFail: true,
  })
  if (!result.ok || !result.stdout) return []
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const createBackupBranch = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const short = runCapture("git", ["rev-parse", "--short", "HEAD"])
  const name = `capybara-local-backup-${stamp}-${short}`
  run("git", ["branch", name])
  return name
}

const configureRemote = async () => {
  if (!existsSync(path.join(root, ".git"))) {
    fail("No .git directory found. Re-download the HTML export from Capybara.")
  }

  // Prefer reusing an existing working `capybara` remote (avoids minting tokens).
  const existingUrl = runCapture(
    "git",
    ["remote", "get-url", CAPYBARA_REMOTE],
    { allowFail: true }
  )
  if (existingUrl.ok && existingUrl.stdout) {
    const probe = runCapture(
      "git",
      ["ls-remote", CAPYBARA_REMOTE, "HEAD"],
      { allowFail: true }
    )
    if (probe.ok) {
      return { remoteUrl: existingUrl.stdout, branch: "main" }
    }
  }

  const remote = await apiFetch("/api/cli/git-remote", { method: "POST" })
  const remoteUrl = remote?.remoteUrl
  const branch = remote?.branch || "main"
  if (!remoteUrl) fail("No Relace remote URL returned")

  // Dedicated remote — do not overwrite the user's `origin` (e.g. GitHub).
  const remotes = runCapture("git", ["remote"])
  if (remotes.split(/\s+/).includes(CAPYBARA_REMOTE)) {
    run("git", ["remote", "set-url", CAPYBARA_REMOTE, remoteUrl])
  } else {
    run("git", ["remote", "add", CAPYBARA_REMOTE, remoteUrl])
  }

  return { remoteUrl, branch }
}

/**
 * Fetch cloud + merge into local. On conflict: write status JSON and exit 2.
 * @returns {{ branch: string, backupBranch: string | null, merged: boolean }}
 */
const integrateCloud = async ({ reason }) => {
  const { branch } = await configureRemote()

  if (existsSync(path.join(root, ".git", "MERGE_HEAD"))) {
    const files = listConflictedFiles()
    if (!existsSync(SYNC_STATUS_PATH)) {
      writeSyncStatus({
        state: "conflict",
        reason: "existing-merge",
        branch,
        remote: CAPYBARA_REMOTE,
        backupBranch: null,
        ours: null,
        theirs: null,
        files,
        createdAt: new Date().toISOString(),
        nextSteps: [
          "Finish the in-progress merge before running pull/push again",
          "Read .capybara/sync-status.json and resolve conflict markers",
          "git add <resolved files> && git commit --no-edit",
          "npm run push",
        ],
      })
    }
    console.error(
      "A merge is already in progress. Resolve conflicts (see .capybara/sync-status.json), commit, then re-run."
    )
    process.exit(CONFLICT_EXIT_CODE)
  }

  // Commit any dirty work first so merge has a clean tree and local edits aren't lost.
  ensureCommit()

  run("git", ["fetch", CAPYBARA_REMOTE, branch])

  const localHead = runCapture("git", ["rev-parse", "HEAD"])
  const remoteRef = `${CAPYBARA_REMOTE}/${branch}`
  const remoteHeadResult = runCapture("git", ["rev-parse", remoteRef], {
    allowFail: true,
  })
  if (!remoteHeadResult.ok) {
    fail(
      `Remote branch ${remoteRef} not found after fetch. Does the Capybara project have commits yet?`
    )
  }
  const remoteHead = remoteHeadResult.stdout

  // Already up to date with cloud (remote is ancestor of local, or equal).
  const bases = runCapture("git", ["merge-base", localHead, remoteHead])
  if (bases === remoteHead) {
    clearSyncStatus()
    return { branch, backupBranch: null, merged: false }
  }

  const backupBranch = createBackupBranch()
  console.log(`Backup branch: ${backupBranch}`)

  const merge = runResult(
    "git",
    [
      "-c",
      "user.name=Capybara Local",
      "-c",
      "user.email=local@capybara.build",
      "merge",
      "--no-edit",
      "--no-ff",
      remoteRef,
      "-m",
      `Merge Capybara ${branch} (${reason})`,
    ],
    { stdio: "inherit" }
  )

  if (merge.status === 0) {
    clearSyncStatus()
    return { branch, backupBranch, merged: true }
  }

  const files = listConflictedFiles()
  if (files.length === 0) {
    // Not a content conflict (shallow history, hooks, etc.) — abort and surface error.
    runResult("git", ["merge", "--abort"], { stdio: "ignore" })
    writeSyncStatus({
      state: "error",
      reason,
      branch,
      remote: CAPYBARA_REMOTE,
      backupBranch,
      ours: localHead,
      theirs: remoteHead,
      files: [],
      createdAt: new Date().toISOString(),
      nextSteps: [
        "Merge failed without conflict markers (history may be unrelated or shallow)",
        `Local backup is at ${backupBranch}`,
        "Try: git fetch capybara --unshallow  (if shallow) then npm run pull again",
        "Or ask the user whether to keep local or cloud and reset intentionally",
      ],
    })
    fail(
      `Merge with Capybara failed without file conflicts. See .capybara/sync-status.json (backup: ${backupBranch})`,
      1
    )
  }

  writeSyncStatus({
    state: "conflict",
    reason,
    branch,
    remote: CAPYBARA_REMOTE,
    backupBranch,
    ours: localHead,
    theirs: remoteHead,
    files,
    createdAt: new Date().toISOString(),
    nextSteps: [
      "Read .capybara/sync-status.json for the conflicted file list",
      "Open each file and resolve conflict markers (<<<<<<< ======= >>>>>>>)",
      "git add <resolved files>",
      'git -c user.name="Capybara Local" -c user.email=local@capybara.build commit --no-edit',
      "npm run push   # or npm run pull if you only needed cloud changes",
    ],
  })

  console.error("")
  console.error("Merge conflict with Capybara cloud.")
  console.error(`Wrote ${path.relative(root, SYNC_STATUS_PATH)}`)
  if (files.length > 0) {
    console.error("Conflicted files:")
    for (const file of files) console.error(`  - ${file}`)
  }
  console.error(
    "Resolve markers, commit the merge, then re-run npm run push (or pull)."
  )
  console.error(`Local backup branch kept at: ${backupBranch}`)
  process.exit(CONFLICT_EXIT_CODE)
}

const push = async () => {
  const { branch } = await integrateCloud({ reason: "before-push" })
  run("git", ["push", "-u", CAPYBARA_REMOTE, `HEAD:${branch}`])
  clearSyncStatus()
  console.log("Pushed to Capybara.")
}

const pull = async () => {
  const { merged } = await integrateCloud({ reason: "pull" })
  if (merged) {
    console.log("Pulled and merged latest from Capybara.")
  } else {
    console.log("Already up to date with Capybara.")
  }
}

const collectFiles = (dir, base, out) => {
  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry)
    const relative = path.relative(base, absolute).replace(/\\/g, "/")
    const stat = statSync(absolute)
    if (stat.isDirectory()) {
      collectFiles(absolute, base, out)
    } else if (stat.isFile()) {
      out.push({ filename: relative, absolute })
    }
  }
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const zipStore = async (files) => {
  const encoder = new TextEncoder()
  const locals = []
  const centrals = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.filename)
    const content = await readFile(file.absolute)
    const checksum = crc32(content)
    const local = Buffer.alloc(30 + nameBytes.length + content.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(content.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    Buffer.from(nameBytes).copy(local, 30)
    content.copy(local, 30 + nameBytes.length)
    locals.push(local)

    const central = Buffer.alloc(46 + nameBytes.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(content.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    Buffer.from(nameBytes).copy(central, 46)
    centrals.push(central)
    offset += local.length
  }

  const centralDir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDir.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, centralDir, end])
}

const publish = async () => {
  await push()
  run("npm", ["run", "build"])

  const distDir = path.join(root, "dist")
  if (!existsSync(distDir)) fail("dist/ missing after build")

  const files = []
  collectFiles(distDir, distDir, files)
  if (files.length === 0) fail("dist/ is empty")

  const zipFiles = files.map((file) => ({
    filename: `dist/${file.filename}`,
    absolute: file.absolute,
  }))
  const zipBuffer = await zipStore(zipFiles)

  const form = new FormData()
  form.append(
    "dist",
    new Blob([new Uint8Array(zipBuffer)], { type: "application/zip" }),
    "dist.zip"
  )

  const result = await apiFetch("/api/cli/publish", {
    method: "POST",
    body: form,
  })

  console.log("Published:")
  console.log(`  Live:  ${result.publishedUrl}`)
  console.log(`  Game:  ${result.gameUrl}`)
  console.log(`  App:   ${result.appUrl}`)
}

const command = process.argv[2]
if (command === "push") {
  await push()
} else if (command === "pull") {
  await pull()
} else if (command === "publish") {
  await publish()
} else {
  fail("Usage: node scripts/capybara-cli.mjs <push|pull|publish>")
}
