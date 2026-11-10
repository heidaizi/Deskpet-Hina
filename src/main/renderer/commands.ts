import { randomUUID } from 'node:crypto'
import type { RendererCommand } from '../../shared/types'
import { state } from '../app-state'

export function sendRendererCommand(command: RendererCommand): void {
  if (
    !state.petWindow ||
    state.petWindow.isDestroyed() ||
    state.petWindow.webContents.isLoading()
  ) {
    return
  }
  const hasSpeech =
    command.speakDialogue !== false &&
    Boolean(command.voice || command.dialogue?.trim() || command.spokenText?.trim())
  const commandWithDelivery =
    hasSpeech && !command.deliveryId
      ? {
          ...command,
          deliveryId: randomUUID(),
        }
      : command
  const resolvedCommand: RendererCommand = {
    ...commandWithDelivery,
    performanceToken: commandWithDelivery.performanceToken ?? randomUUID(),
  }
  const overlayMicro =
    resolvedCommand.bodyPolicy === 'overlay' && Boolean(resolvedCommand.microMotion)
  const hasActivePerformance = Boolean(
    state.presenceController?.getDiagnostics().activePerformanceToken,
  )
  if (!overlayMicro || !hasActivePerformance) {
    state.presenceController?.handlePerformanceScheduled(resolvedCommand.performanceToken ?? '')
  }
  if (resolvedCommand.deliveryId) {
    state.presenceController?.handleDeliveryScheduled(resolvedCommand.deliveryId)
  }
  state.petWindow.webContents.send('pet:renderer-command', resolvedCommand)
}
