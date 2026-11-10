import type { DeskpetApi } from '@shared/types'

declare global {
  interface Window {
    deskpet: DeskpetApi
  }
}

export {}
