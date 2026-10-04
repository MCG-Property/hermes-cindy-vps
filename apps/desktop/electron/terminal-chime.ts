import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

import { ipcMain } from 'electron'

const MAC_CHIMES = ['/System/Library/Sounds/Glass.aiff', '/System/Library/Sounds/Ping.aiff']

export function macChimePath(platform = process.platform, exists = existsSync): string | null {
  if (platform !== 'darwin') {
    return null
  }

  return MAC_CHIMES.find(path => exists(path)) ?? null
}

export function registerTerminalChime(): void {
  ipcMain.handle('hermes:play-chime', () => {
    const file = macChimePath()

    if (!file) {
      return false
    }

    spawn('afplay', [file], { detached: true, stdio: 'ignore' }).unref()

    return true
  })
}
