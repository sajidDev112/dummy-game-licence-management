/*
 * The 16-digit machine number that identifies this PC to the licence server.
 *
 * It is generated once, on the first launch after the first install, and then
 * never changes: reinstalling or updating the app keeps it. To survive that it
 * is stored OUTSIDE the app's install folder and outside its own userData
 * folder, in two places, so losing one still recovers the other:
 *
 *   1. %APPDATA%\OpEzee\machine.json
 *   2. HKCU\Software\OpEzee\MachineNumber   (Windows registry)
 *
 * Neither is touched by the installer or the uninstaller.
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const VALID = /^\d{16}$/
const REG_KEY = 'HKCU\\Software\\OpEzee'
const REG_VALUE = 'MachineNumber'

/** 16 random digits; the first is never 0 so it always reads as 16 digits. */
function generate() {
  let digits = String(crypto.randomInt(1, 10))
  while (digits.length < 16) digits += String(crypto.randomInt(0, 10))
  return digits
}

function fileReader(file) {
  return {
    read() {
      try {
        const value = JSON.parse(fs.readFileSync(file, 'utf8')).machineNumber
        return VALID.test(value) ? value : null
      } catch {
        return null
      }
    },
    write(value) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(
          file,
          JSON.stringify({ machineNumber: value, createdAt: new Date().toISOString() }, null, 2)
        )
      } catch {
        /* the registry copy still holds it */
      }
    },
  }
}

const registry = {
  read() {
    if (process.platform !== 'win32') return null
    try {
      const out = execFileSync('reg', ['query', REG_KEY, '/v', REG_VALUE], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const match = out.match(/MachineNumber\s+REG_SZ\s+(\d+)/)
      return match && VALID.test(match[1]) ? match[1] : null
    } catch {
      return null
    }
  },
  write(value) {
    if (process.platform !== 'win32') return
    try {
      execFileSync('reg', ['add', REG_KEY, '/v', REG_VALUE, '/t', 'REG_SZ', '/d', value, '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      })
    } catch {
      /* the file copy still holds it */
    }
  },
}

let cached = null

/**
 * Returns the machine number, creating it on the very first run. Whichever
 * store still has it wins, and any store that lost it is repaired.
 */
function getMachineNumber(appDataDir) {
  if (cached) return cached

  const stores = [fileReader(path.join(appDataDir, 'OpEzee', 'machine.json')), registry]
  const found = stores.map((s) => s.read())
  const value = found.find(Boolean) || generate()

  stores.forEach((store, i) => {
    if (found[i] !== value) store.write(value)
  })

  cached = value
  return value
}

module.exports = { getMachineNumber }
