import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { BasicManipulator, Condition, ToEvent } from 'karabiner.ts'
import { pipe, type PipeRule, type Stage } from './pipe.ts'
import { stages } from './stages.ts'

// pipe() が作ったルールを Karabiner と同じ方法（上から順に、最初に合ったものだけ使う）で動かした結果が、
// 段ごとに順番にルールを通した結果と同じになるかを、キーと状態の組み合わせを総当たりして確かめる

type World = {
  app: string
  device: 'macbook' | 'magic' | 'external'
  language: string
  vars: Record<string, number>
  expressions: Record<string, boolean>
}
type Output = string

const genericModifiers = ['command', 'control', 'option', 'shift']
const sided = (x: string) => (genericModifiers.includes(x) ? `left_${x}` : x)
const withoutSide = (x: string) => x.replace(/^(left|right)_/, '')
const covers = (a: string, b: string) =>
  a === 'any' || a === b || (genericModifiers.includes(a) && (b === `left_${a}` || b === `right_${a}`))

function conditionHolds(c: Condition, world: World): boolean {
  const unless = c.type.endsWith('_unless')
  const result = (() => {
    switch (c.type) {
      case 'frontmost_application_if':
      case 'frontmost_application_unless':
        return (c.bundle_identifiers ?? []).some((re) => new RegExp(re).test(world.app))
      case 'device_if':
      case 'device_unless':
        return c.identifiers.some((id) =>
          id.is_built_in_keyboard ? world.device === 'macbook' : id.product_id === 666 && world.device === 'magic',
        )
      case 'input_source_if':
      case 'input_source_unless':
        return c.input_sources.some((s) => new RegExp(s.language ?? '').test(world.language))
      case 'variable_if':
      case 'variable_unless':
        return (world.vars[c.name] ?? 0) === c.value
      case 'expression_if':
      case 'expression_unless':
        return world.expressions[c.expression] ?? false
      default:
        throw new Error(`テストが対応していない条件: ${c.type}`)
    }
  })()
  return unless ? !result : result
}

// from に当たったら、そのとき押されたままになる修飾キーを返す。当たらなければ undefined
function match(m: BasicManipulator, key: string, held: string[], world: World): string[] | undefined {
  const from = m.from as { key_code?: string; any?: string; modifiers?: { mandatory?: string[]; optional?: string[] } }
  if (from.key_code !== key && from.any !== 'key_code') return undefined
  const mandatory = from.modifiers?.mandatory ?? []
  const optional = from.modifiers?.optional ?? []
  if (!mandatory.every((md) => held.some((h) => covers(md, h)))) return undefined
  const rest = held.filter((h) => !mandatory.some((md) => covers(md, h)))
  if (!rest.every((h) => optional.some((o) => covers(o, h)))) return undefined
  if (!(m.conditions ?? []).every((c) => conditionHolds(c, world))) return undefined
  return rest
}

function render(events: ToEvent[] | undefined, key: string, passThrough: string[], world: World) {
  return (events ?? []).flatMap((e): Array<{ key: string; mods: string[] } | Output> => {
    if (!(e.conditions ?? []).every((c) => conditionHolds(c, world))) return []
    if ('set_variable' in e) return [`set ${e.set_variable.name}=${e.set_variable.value ?? e.set_variable.expression}`]
    if ('shell_command' in e) return [`$ ${e.shell_command}`]
    const k = 'from_event' in e ? key : 'key_code' in e ? String(e.key_code) : JSON.stringify(e)
    const mods = [...new Set([...(e.modifiers ?? []).map(sided), ...passThrough])].sort()
    return [{ key: k, mods }]
  })
}

const lists = ['to', 'to_if_alone', 'to_after_key_up'] as const

// 段ごとに順番にルールを通す（本来ほしい動き）
function runStages(stageRules: PipeRule[][], key: string, held: string[], world: World) {
  const [first, ...rest] = stageRules
  const firstHit = first.flatMap((r) => r.manipulators as BasicManipulator[]).find((m) => match(m, key, held, world))
  let outputs: Record<string, Array<{ key: string; mods: string[] } | Output>>
  if (firstHit) {
    const pass = match(firstHit, key, held, world)!
    outputs = Object.fromEntries(lists.map((l) => [l, render(firstHit[l], key, pass, world)]))
  } else {
    outputs = { to: [{ key, mods: [...held].sort() }], to_if_alone: [], to_after_key_up: [] }
  }
  for (const stage of rest) {
    const manipulators = stage.flatMap((r) => r.manipulators as BasicManipulator[])
    for (const l of lists) {
      outputs[l] = outputs[l].flatMap((o) => {
        if (typeof o === 'string') return [o]
        const hit = manipulators.find((m) => match(m, o.key, o.mods, world))
        if (!hit) return [o]
        return render(hit.to, o.key, match(hit, o.key, o.mods, world)!, world)
      })
    }
  }
  return outputs
}

// pipe() が作ったルールを Karabiner と同じ方法で動かす
function runComposed(rules: PipeRule[], key: string, held: string[], world: World) {
  const hit = rules.flatMap((r) => r.manipulators as BasicManipulator[]).find((m) => match(m, key, held, world))
  if (!hit) return { to: [{ key, mods: [...held].sort() }], to_if_alone: [], to_after_key_up: [] }
  const pass = match(hit, key, held, world)!
  return Object.fromEntries(lists.map((l) => [l, render(hit[l], key, pass, world)]))
}

// pipe() は押されていた修飾キーを出し直すときに左右を区別できない（右 Cmd も左 Cmd として出す）ので、左右を区別せずに比べる
function withoutSides(outputs: ReturnType<typeof runComposed>) {
  return Object.fromEntries(
    Object.entries(outputs).map(([l, list]) => [
      l,
      list.map((o) => (typeof o === 'string' ? o : { key: o.key, mods: [...new Set(o.mods.map(withoutSide))].sort() })),
    ]),
  )
}

function* combinations<T>(items: T[], maxSize: number): Generator<T[]> {
  yield []
  for (let i = 0; i < items.length; i++) {
    if (maxSize === 0) return
    for (const rest of combinations(items.slice(i + 1), maxSize - 1)) yield [items[i], ...rest]
  }
}

function checkSameAsStages(input: Stage[], worlds: World[]) {
  const stageRules = input.map((s) => pipe(...[s]).filter((r) => r.enabled !== false))
  const composed = pipe(...input).filter((r) => r.enabled !== false)
  const keys = [
    ...new Set(
      stageRules.flat().flatMap((r) => r.manipulators.map((m) => (m.from as { key_code?: string }).key_code ?? 'x')),
    ),
  ]
  const modifiers = ['left_shift', 'left_command', 'left_control', 'left_option', 'right_command', 'caps_lock']
  let checked = 0
  for (const world of worlds) {
    for (const key of keys) {
      for (const held of combinations(modifiers, 2)) {
        const expected = withoutSides(runStages(stageRules, key, held, world))
        const actual = withoutSides(runComposed(composed, key, held, world))
        assert.deepEqual(actual, expected, `${key} + [${held}] / ${JSON.stringify(world)}`)
        checked++
      }
    }
  }
  return checked
}

function* worldsFor(expressions: string[]): Generator<World> {
  for (const app of ['com.google.Chrome', 'com.tinyspeck.slackmacgap', 'com.apple.Terminal'])
    for (const device of ['macbook', 'magic', 'external'] as const)
      for (const language of ['ja', 'en'])
        for (const [spaceLayer, kanaLayer] of [[0, 0], [1, 0], [0, 1]])
          for (const ime of [0, 1])
            for (let exprMask = 0; exprMask < 1 << expressions.length; exprMask++)
              yield {
                app,
                device,
                language,
                vars: { space_layer: spaceLayer, kana_layer: kanaLayer, ime_composing: ime, space_used: 0, kana_used: 0 },
                expressions: Object.fromEntries(expressions.map((e, i) => [e, Boolean(exprMask & (1 << i))])),
              }
}

test('今の設定で、pipe() の結果が段ごとに順番に通した結果と同じになる', () => {
  const checked = checkSameAsStages(stages, [
    ...worldsFor([
      'system.now.milliseconds - space_tap_ms < 200',
      'system.now.milliseconds - space_down_ms < 125',
      'system.now.milliseconds - kana_down_ms < 125',
    ]),
  ])
  assert.ok(checked > 0)
})
