// Generate the PWA / web PNG icon set from the source art in assets/.
//
// Why a script instead of `npx @capacitor/assets generate --pwa`: that command
// emits WebP by default, and in manifest mode it writes PNG bytes into *.webp
// filenames and tags every icon "any maskable" without a real safe-zone
// composite — and never produces a 180px apple-touch-icon. We need exact PNGs:
// separate "any" (192/512), a true "maskable" (adaptive foreground over the
// gradient background, so nothing clips under a circular mask), an
// apple-touch-icon, and small favicons. @capacitor/assets is still used for the
// Android adaptive icons in CI (`generate --android`), which it does well.
//
//   Run:  node scripts/gen-pwa-icons.mjs
//
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = (f) => join(root, 'assets', f)
const outDir = join(root, 'public', 'icons')
await mkdir(outDir, { recursive: true })
const out = (f) => join(outDir, f)

const only = src('icon-only.png')

// Full-bleed "any" icons + apple-touch + favicons, all from the full-bleed mark.
await sharp(only).resize(192, 192).png().toFile(out('icon-192.png'))
await sharp(only).resize(512, 512).png().toFile(out('icon-512.png'))
await sharp(only).resize(180, 180).png().toFile(out('apple-touch-icon.png'))
await sharp(only).resize(32, 32).png().toFile(out('icon-32.png'))
await sharp(only).resize(16, 16).png().toFile(out('icon-16.png'))

// Maskable: composite the adaptive foreground over the gradient background so the
// mark sits inside the safe zone (no corner clipping under a circular/squircle mask).
const bg = await sharp(src('icon-background.png')).resize(512, 512).toBuffer()
const fg = await sharp(src('icon-foreground.png')).resize(512, 512).toBuffer()
await sharp(bg).composite([{ input: fg }]).png().toFile(out('icon-512-maskable.png'))

console.log('Generated PWA icons → public/icons/')
