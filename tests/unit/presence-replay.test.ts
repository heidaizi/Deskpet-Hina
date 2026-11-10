import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  runPresenceReplayScenario,
  type PresenceReplayScenario,
} from '../../src/main/presence/presence-replay'

const scenarios = (
  JSON.parse(readFileSync(join(process.cwd(), 'scripts/presence-soak-scenarios.json'), 'utf8')) as {
    scenarios: PresenceReplayScenario[]
  }
).scenarios

describe('presence virtual-clock replay', () => {
  for (const scenario of scenarios) {
    it(`${scenario.name} stays within final runtime budgets`, () => {
      const report = runPresenceReplayScenario(scenario)

      expect(report.samples).toBe(
        Math.ceil((scenario.durationHours * 3_600_000) / (scenario.sampleIntervalSeconds * 1_000)),
      )
      expect(report.passed).toEqual({
        memoryBudget: true,
        speechBudget: true,
        deliveryBudget: true,
        repeatBudget: true,
      })
      expect(report.maxMemoryCount).toBeLessThanOrEqual(100)
      expect(report.telemetry.decisions).toBeGreaterThan(0)
      expect(report.telemetry.sceneSamples).toBe(report.samples)
      expect(report.telemetry.performed).toBe(report.deliveries)
      expect(report.interruptionRate).toBeGreaterThan(0)
      expect(report.interruptionRate).toBeLessThanOrEqual(1)
    })
  }
})
