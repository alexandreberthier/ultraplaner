/**
 * Cross-platform `bundleRelease` via the Android Gradle Wrapper.
 * On Windows uses gradlew.bat; elsewhere ./gradlew.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const androidDir = join(process.cwd(), 'android')
const isWin = process.platform === 'win32'
const gradlewName = isWin ? 'gradlew.bat' : 'gradlew'
const gradlew = join(androidDir, gradlewName)

if (!existsSync(gradlew)) {
  console.error(`[android-bundle] missing ${gradlewName} in android/`)
  process.exit(1)
}

const result = spawnSync(gradlew, ['bundleRelease'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWin,
  env: process.env,
})

process.exit(result.status ?? 1)
