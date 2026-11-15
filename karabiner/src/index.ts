import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { complexModifications } from 'karabiner.ts'
import { pipe } from './pipe.ts'
import { stages } from './stages.ts'

// karabiner.json の Default profile のルールを書き換える。npm run dry-run のときは書き込まずに表示する
// karabiner.ts の writeToProfile() は Node.js で直接実行すると require がなくて動かないため、自分で書き込む
const configPath = fileURLToPath(new URL('../karabiner.json', import.meta.url))
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const profile = config.profiles.find((p: { name: string }) => p.name === 'Default profile')
profile.complex_modifications = complexModifications(pipe(...stages))
const json = JSON.stringify(config, null, 2) + '\n'
if (process.argv.includes('--dry-run')) {
  process.stdout.write(json)
} else {
  writeFileSync(configPath, json)
  console.log(`✓ ${configPath} を更新しました`)
}
