import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  runPresenceReplayScenario,
  type PresenceReplayScenario,
} from '../src/main/presence/presence-replay'

const projectRoot = process.cwd()
const scenarioPath = resolve(projectRoot, process.argv[2] ?? 'scripts/presence-soak-scenarios.json')
const outputPath = resolve(projectRoot, process.argv[3] ?? 'dist/presence-soak-report.json')
const input = JSON.parse(readFileSync(scenarioPath, 'utf8')) as {
  scenarios: PresenceReplayScenario[]
}

if (!Array.isArray(input.scenarios) || input.scenarios.length === 0) {
  throw new Error('Presence replay file has no scenarios.')
}

const reports = input.scenarios.map(runPresenceReplayScenario)
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      reports,
    },
    null,
    2,
  ),
  'utf8',
)

for (const report of reports) {
  console.log(
    [
      report.name,
      `${report.durationHours}h`,
      `samples=${report.samples}`,
      `deliveries=${report.deliveries} (${report.deliveriesPerHour}/h)`,
      `speech=${report.speechesPerHour}/h peak=${report.peakSpeechesPerHour}`,
      `silent=${(report.silentRate * 100).toFixed(1)}%`,
      `repeat=${(report.duplicateDialogueRate * 100).toFixed(1)}%`,
      `interruptions=${(report.interruptionRate * 100).toFixed(1)}%`,
      `rules=${report.uniqueRules}`,
      `memories=${report.maxMemoryCount}`,
      `wall=${report.wallTimeMs}ms`,
      `passed=${Object.values(report.passed).every(Boolean)}`,
    ].join(' | '),
  )
}

console.log(`Report: ${outputPath}`)
