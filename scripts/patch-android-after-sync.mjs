/**
 * Capacitor regenerates android/capacitor-cordova-android-plugins on every sync
 * with an empty flatDir{} that triggers FLAT_DIR_REPOSITORY_USED in AGP 9.
 * We use no Cordova plugins — strip flatDir when libs dirs have no jars/aars.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const cordovaDir = join(root, 'android', 'capacitor-cordova-android-plugins')
const buildGradle = join(cordovaDir, 'build.gradle')

function hasLocalLibs(dir) {
  if (!existsSync(dir)) return false
  return readdirSync(dir).some((name) => /\.(jar|aar)$/i.test(name))
}

if (!existsSync(buildGradle)) {
  console.log('[patch-android-after-sync] no cordova build.gradle — skip')
  process.exit(0)
}

const needsFlatDir =
  hasLocalLibs(join(cordovaDir, 'libs')) ||
  hasLocalLibs(join(cordovaDir, 'src', 'main', 'libs'))

let text = readFileSync(buildGradle, 'utf8')
const flatDirBlock = /\n[ \t]*flatDir\s*\{[\s\S]*?\n[ \t]*\}\r?\n/

if (!needsFlatDir && flatDirBlock.test(text)) {
  text = text.replace(flatDirBlock, '\n')
  writeFileSync(buildGradle, text)
  console.log('[patch-android-after-sync] removed empty flatDir from cordova plugins module')
} else if (needsFlatDir) {
  console.log('[patch-android-after-sync] kept flatDir (local jar/aar present)')
} else {
  console.log('[patch-android-after-sync] flatDir already absent')
}
