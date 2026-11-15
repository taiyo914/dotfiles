import type {
  BasicManipulator,
  Condition,
  FromModifiers,
  Manipulator,
  Rule,
  RuleBuilder,
  ToEvent,
} from 'karabiner.ts'

// pipe() は、前の段のルールが出したキーを次の段のルールに通した結果を、
// npm run build のときに計算して 1 つのルールにまとめる。
// Karabiner-Elements は、ルールが出したキーをほかのルールに通さないため。

export type PipeRule = Rule & { enabled?: boolean }
type RuleSource = Rule | RuleBuilder | PipeRule
export type Stage = RuleSource | RuleSource[]

type ModifierSet = string[] | 'any'
type KeyEvent = ToEvent & { key_code: string; modifiers?: string[] }

// 次の段のルールが、あるキーを受け取るために必要な状態
type Guard = {
  conditions: Condition[]
  // 物理キーで押されている必要がある修飾キー
  need: string[]
  // 押されていてもよい修飾キー
  allowed: ModifierSet
  // 前の段が出したキーに付いていて、次の段のルールが使わずに残す修飾キー
  residual: string[]
  rule: BasicManipulator
  id: string
}

const genericModifiers = ['command', 'control', 'option', 'shift']
const downstreamManipulatorKeys = new Set(['type', 'from', 'to', 'conditions', 'description'])

// Karabiner の画面でルールを ON にしたときだけ動くようにする
export function disabledByDefault(source: RuleSource): PipeRule {
  return { ...buildRule(source), enabled: false }
}

// 段を順番につなげて、Karabiner に書き出すルールの一覧を作る
export function pipe(...stages: Stage[]): PipeRule[] {
  const [firstStage, ...laterStages] = stages.map((stage) =>
    (Array.isArray(stage) ? stage : [stage]).map(buildRule),
  )
  let rules = firstStage
  for (const stage of laterStages) {
    stage.forEach(validateDownstreamRule)
    const downstream = stage.flatMap((rule) => rule.manipulators as BasicManipulator[])
    rules = [
      ...rules.map((rule) => ({
        ...rule,
        manipulators: rule.manipulators.flatMap((m) => passToNextStage(m, downstream)),
      })),
      ...stage,
    ]
  }
  return removeUnreachable(rules)
}

// 前にあるマニピュレーターが必ず先に当たるため、一度も使われないマニピュレーターを消す
function removeUnreachable(rules: PipeRule[]): PipeRule[] {
  const reachable: BasicManipulator[] = []
  return rules.map((rule) => ({
    ...rule,
    manipulators: rule.manipulators.filter((m) => {
      if (m.type !== 'basic') return true
      if (reachable.some((earlier) => shadows(earlier, m))) return false
      // OFF にできるルールは、OFF のときにほかのマニピュレーターを隠さないので数に入れない
      if (rule.enabled !== false) reachable.push(m)
      return true
    }),
  }))
}

// earlier が当たるキー入力に、later も必ず当たるか
function shadows(earlier: BasicManipulator, later: BasicManipulator): boolean {
  const e = earlier.from as Record<string, unknown> & { modifiers?: FromModifiers }
  const l = later.from as Record<string, unknown> & { modifiers?: FromModifiers }
  const sameKey = 'key_code' in l ? e.key_code === l.key_code || e.any === 'key_code' : false
  if (!sameKey) return false

  const earlierMandatory = toModifierSet(e.modifiers?.mandatory)
  const laterMandatory = toModifierSet(l.modifiers?.mandatory)
  if (earlierMandatory === 'any' || laterMandatory === 'any') return false
  if (!earlierMandatory.every((x) => laterMandatory.some((y) => covers(x, y)))) return false

  const earlierAllowed = toModifierSet(e.modifiers?.optional)
  const laterAllowed = toModifierSet(l.modifiers?.optional)
  const laterExtras = laterMandatory.filter((y) => !earlierMandatory.some((x) => covers(x, y)))
  if (earlierAllowed !== 'any') {
    if (laterAllowed === 'any') return false
    if (![...laterAllowed, ...laterExtras].every((y) => includes(earlierAllowed, y))) return false
  }

  const laterConditions = new Set((later.conditions ?? []).map((c) => JSON.stringify(c)))
  return (earlier.conditions ?? []).every((c) => laterConditions.has(JSON.stringify(c)))
}

function buildRule(source: RuleSource): PipeRule {
  return 'build' in source ? source.build() : source
}

// 2 段目以降のルールが「このキーが来たらこのキーを出す」だけになっているか確かめる
function validateDownstreamRule(rule: PipeRule) {
  const fail: (reason: string) => never = (reason) => {
    throw new Error(`「${rule.description}」は 2 段目以降に置けません。${reason}`)
  }
  if (rule.enabled === false) {
    fail('2 段目以降のルールは前の段のルールに組み込まれるため、Karabiner の画面で ON / OFF を切り替えられません。')
  }
  for (const m of rule.manipulators) {
    if (m.type !== 'basic') fail(`type が ${m.type} のルールは組み合わせられません。`)
    const extraKeys = Object.keys(m).filter((key) => !downstreamManipulatorKeys.has(key))
    if (extraKeys.length) {
      fail(`${extraKeys.join(', ')} を使うルールは、キーを押した時間やタイミングを見るため 1 段目に置いてください。`)
    }
    if (!('key_code' in m.from)) fail('from には key_code を 1 つだけ書いてください。')
    if (m.from.modifiers?.mandatory?.includes('any' as never)) fail('mandatory に any は使えません。')
  }
}

// 1 つのマニピュレーターの出力を次の段に通して、必要な数のマニピュレーターに分ける
function passToNextStage(m: Manipulator, downstream: BasicManipulator[]): Manipulator[] {
  if (m.type !== 'basic') return [m]
  return expandFromEvent(m, downstream).flatMap((expanded) => composeWithNextStage(expanded, downstream))
}

// 「押されたキーをそのまま出す」(from_event) を、次の段が受け取るキーごとのマニピュレーターに展開する
// 出力が何のキーかがわからないと、次の段のどのルールに当たるかを計算できないため
function expandFromEvent(m: BasicManipulator, downstream: BasicManipulator[]): BasicManipulator[] {
  const from = m.from
  if (!allEvents(m).some((e) => 'from_event' in e)) return [m]
  if ('key_code' in from) return [replaceFromEvent(m, String(from.key_code))]
  if (!('any' in from) || from.any !== 'key_code') return [m]

  const keys = [...new Set(downstream.map((d) => String((d.from as { key_code: string }).key_code)))]
  const perKey = keys.map((key) =>
    replaceFromEvent({ ...m, from: { key_code: key, modifiers: from.modifiers } as BasicManipulator['from'] }, key),
  )
  return [...perKey, m]
}

function replaceFromEvent(m: BasicManipulator, key: string): BasicManipulator {
  return mapEventLists(m, (events) =>
    events.map((e) => {
      if (!('from_event' in e)) return e
      const { from_event: _, ...options } = e
      return { ...options, key_code: key } as ToEvent
    }),
  )
}

// 次の段の条件が成り立つ場合と成り立たない場合のすべての組み合わせについて、マニピュレーターを作る
function composeWithNextStage(m: BasicManipulator, downstream: BasicManipulator[]): BasicManipulator[] {
  const baseMandatory = toModifierSet(m.from.modifiers?.mandatory)
  if (baseMandatory === 'any') return [m]
  const baseOptional = toModifierSet(m.from.modifiers?.optional)

  const guardsByEvent = new Map<KeyEvent, Guard[]>()
  for (const e of allEvents(m)) {
    if (!isKeyEvent(e)) continue
    const guards = downstream.flatMap((d) => guardFor(d, e) ?? [])
    if (guards.length) guardsByEvent.set(e, guards)
  }
  if (guardsByEvent.size === 0) return [m]

  const allGuards = [...guardsByEvent.values()].flat()
  const switchable = uniqueBy(allGuards.filter((g) => !isAlwaysTrue(g)), (g) => g.id)
  if (switchable.length > 8) {
    throw new Error(`組み合わせが多すぎます（${switchable.length} 個の条件）: ${JSON.stringify(m.from)}`)
  }

  // 条件が成り立つ場合を先に並べる。Karabiner は上から順に最初に合ったものだけを使うので、
  // 後ろに並べたものは「前の条件が成り立たない場合」として動く
  const results: BasicManipulator[] = []
  for (let mask = 2 ** switchable.length - 1; mask >= 0; mask--) {
    const activeIds = new Set(
      switchable.filter((_, i) => mask & (1 << (switchable.length - 1 - i))).map((g) => g.id),
    )
    const isActive = (g: Guard) => isAlwaysTrue(g) || activeIds.has(g.id)
    const active = uniqueBy(allGuards.filter(isActive), (g) => g.id)
    const scenario = buildScenario(m, baseMandatory, baseOptional, active, guardsByEvent, isActive)
    if (scenario) results.push(scenario)
  }
  return results
}

// 次の段のルール d が、キー e を受け取れる場合の条件を作る。受け取れないときは undefined
function guardFor(d: BasicManipulator, e: KeyEvent): Guard | undefined {
  const from = d.from as { key_code: string; modifiers?: FromModifiers }
  if (String(from.key_code) !== e.key_code) return undefined

  const eventModifiers = (e.modifiers ?? []).map(toSidedModifier)
  const mandatory = (from.modifiers?.mandatory ?? []) as string[]
  const optional = toModifierSet(from.modifiers?.optional)
  const residual = eventModifiers.filter((x) => !mandatory.some((md) => covers(md, x)))
  if (!residual.every((x) => includes(optional, x))) return undefined

  const need = mandatory.filter((md) => !eventModifiers.some((x) => covers(md, x)))
  const allowed: ModifierSet = optional === 'any' ? 'any' : [...mandatory, ...optional]
  const conditions = d.conditions ?? []
  const id = JSON.stringify({ conditions, need, allowed, residual, d })
  return { conditions, need, allowed, residual, rule: d, id }
}

// active の条件がすべて成り立つときのマニピュレーターを作る。ありえない組み合わせなら undefined
function buildScenario(
  m: BasicManipulator,
  baseMandatory: string[],
  baseOptional: ModifierSet,
  active: Guard[],
  guardsByEvent: Map<KeyEvent, Guard[]>,
  isActive: (g: Guard) => boolean,
): BasicManipulator | undefined {
  const lifted = uniqueBy(active.flatMap((g) => g.need), (x) => x)
  const feasible = lifted.every(
    (x) =>
      !baseMandatory.some((b) => covers(b, x) || covers(x, b)) &&
      includes(baseOptional, x) &&
      active.every((g) => includes(g.allowed, x)),
  )
  if (!feasible) return undefined

  const mandatory = [...baseMandatory, ...lifted]
  const allowedExtras = active.reduce<ModifierSet>((acc, g) => intersect(acc, g.allowed), baseOptional)
  const optional: ModifierSet =
    allowedExtras === 'any' ? 'any' : allowedExtras.filter((x) => !mandatory.some((md) => covers(md, x)))
  const conditions = uniqueBy([...(m.conditions ?? []), ...active.flatMap((g) => g.conditions)], (c) =>
    JSON.stringify(c),
  )

  const composed = mapEventLists(m, (events) =>
    events.flatMap((e) => {
      const guard = isKeyEvent(e) ? guardsByEvent.get(e)?.find(isActive) : undefined
      if (!guard) return [addModifiers(e, lifted)]
      // 次の段のルールが使わなかった修飾キーは、次の段の出力にそのまま付ける
      const keep = [...lifted.filter((x) => !guard.need.includes(x)), ...guard.residual]
      const { key_code: _k, modifiers: _m, conditions: eventConditions, ...eventOptions } = e as KeyEvent
      return (guard.rule.to ?? []).map((out) => {
        const outConditions = [...(eventConditions ?? []), ...(out.conditions ?? [])]
        return addModifiers(
          { ...eventOptions, ...out, ...(outConditions.length ? { conditions: outConditions } : {}) },
          keep,
        )
      })
    }),
  )

  const modifiers: FromModifiers = {}
  if (mandatory.length) modifiers.mandatory = mandatory as FromModifiers['mandatory']
  if (optional === 'any' || optional.length) {
    modifiers.optional = (optional === 'any' ? ['any'] : optional) as FromModifiers['optional']
  }
  const from = { ...m.from, modifiers } as BasicManipulator['from']
  if (!Object.keys(modifiers).length) delete (from as { modifiers?: FromModifiers }).modifiers

  const result: BasicManipulator = { ...composed, from }
  if (conditions.length) result.conditions = conditions
  else delete result.conditions
  return result
}

// マニピュレーターが出すキーの一覧（タップ時、長押し時、離した後なども含む）の中身を書き換える
function mapEventLists(m: BasicManipulator, f: (events: ToEvent[]) => ToEvent[]): BasicManipulator {
  const result: BasicManipulator = { ...m }
  for (const key of ['to', 'to_if_alone', 'to_if_held_down', 'to_after_key_up'] as const) {
    if (m[key]) result[key] = f(m[key])
  }
  if (m.to_delayed_action) {
    result.to_delayed_action = {
      to_if_invoked: f(m.to_delayed_action.to_if_invoked ?? []),
      to_if_canceled: f(m.to_delayed_action.to_if_canceled ?? []),
    }
  }
  if (m.to_if_other_key_pressed) {
    result.to_if_other_key_pressed = m.to_if_other_key_pressed.map((v) => ({ ...v, to: f(v.to) }))
  }
  return result
}

function allEvents(m: BasicManipulator): ToEvent[] {
  const events: ToEvent[] = []
  mapEventLists(m, (list) => (events.push(...list), list))
  return events
}

function isKeyEvent(e: ToEvent): e is KeyEvent {
  return 'key_code' in e
}

function isAlwaysTrue(g: Guard) {
  return g.conditions.length === 0 && g.need.length === 0 && g.allowed === 'any'
}

function addModifiers(e: ToEvent, modifiers: string[]): ToEvent {
  if (!isKeyEvent(e) || modifiers.length === 0) return e
  const merged = uniqueBy([...(e.modifiers ?? []), ...modifiers.map(toSidedModifier)], (x) => x)
  return { ...e, modifiers: merged } as ToEvent
}

function toModifierSet(list: readonly string[] | undefined): ModifierSet {
  return list?.includes('any') ? 'any' : [...(list ?? [])]
}

// 出力のキーに付ける修飾キーは、左右を決めた名前にそろえる（command は left_command として送られる）
function toSidedModifier(x: string) {
  return genericModifiers.includes(x) ? `left_${x}` : x
}

// 修飾キーの指定 a が、修飾キー b を含むか（command は left_command と right_command を含む）
function covers(a: string, b: string) {
  return a === 'any' || a === b || (genericModifiers.includes(a) && (b === `left_${a}` || b === `right_${a}`))
}

function includes(set: ModifierSet, x: string) {
  return set === 'any' || set.some((s) => covers(s, x))
}

function intersect(a: ModifierSet, b: ModifierSet): ModifierSet {
  if (a === 'any') return b
  if (b === 'any') return a
  const result = a.flatMap((x) => b.flatMap((y) => (covers(x, y) ? [y] : covers(y, x) ? [x] : [])))
  return uniqueBy(result, (x) => x)
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
