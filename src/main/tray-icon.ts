import { nativeImage, type NativeImage } from 'electron'

const ICON_SIZE = 22

export function createTrayIcon(): NativeImage {
  const pixels = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4)

  const paint = (x: number, y: number, alpha = 255): void => {
    if (x < 0 || y < 0 || x >= ICON_SIZE || y >= ICON_SIZE) {
      return
    }
    const offset = (y * ICON_SIZE + x) * 4
    pixels[offset] = 0
    pixels[offset + 1] = 0
    pixels[offset + 2] = 0
    pixels[offset + 3] = alpha
  }

  for (let y = 2; y < ICON_SIZE; y += 1) {
    for (let x = 2; x < ICON_SIZE - 2; x += 1) {
      const haloDx = x - 11
      const haloDy = y - 5
      const haloDistance = Math.sqrt(haloDx * haloDx + haloDy * haloDy)
      if (haloDistance >= 4.2 && haloDistance <= 6) {
        paint(x, y)
      }

      const headDx = x - 11
      const headDy = y - 13
      if (headDx * headDx + headDy * headDy <= 26) {
        paint(x, y)
      }

      if ((x >= 5 && x <= 8 && y >= 7 && y <= 11) || (x >= 14 && x <= 17 && y >= 7 && y <= 11)) {
        paint(x, y)
      }
    }
  }

  const icon = nativeImage.createFromBitmap(pixels, {
    width: ICON_SIZE,
    height: ICON_SIZE,
    scaleFactor: 1,
  })
  icon.setTemplateImage(true)
  return icon
}
