import type { Register } from 'claude-code'

type Block =
  | { kind: 'body'; text: string }
  | { kind: 'heading'; text: string; width: number }

const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/
const FENCE = /^\s*(```|~~~)/

// 返答の文章を、見出しの行とそれ以外のまとまりに分ける
function splitByHeadings(markdown: string): Block[] {
  const blocks: Block[] = []
  let body: string[] = []
  let isInFence = false

  const flushBody = () => {
    const text = body.join('\n').replace(/^\n+|\n+$/g, '')
    if (text !== '') blocks.push({ kind: 'body', text })
    body = []
  }

  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) isInFence = !isInFence

    const heading = isInFence ? null : line.match(HEADING)
    if (heading) {
      flushBody()
      blocks.push({ kind: 'heading', text: line, width: displayWidth(stripInlineMarkdown(heading[1])) })
    } else {
      body.push(line)
    }
  }
  flushBody()

  return blocks
}

// 見出しの文字から、画面に表示されない記号 (**, `, リンクの URL) を取り除く
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|`|~~)/g, '')
}

// 文字列がターミナルで何マス使うかを数える (日本語や絵文字は 2 マス)
function displayWidth(text: string): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const isWide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff) ||
      (code >= 0x20000 && code <= 0x3fffd)
    width += isWide ? 2 : 1
  }
  return width
}

export const register: Register = on => {
  // Claude の返答に見出しがあれば、見出しの次の行に同じ幅の線を引いて表示する
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const blocks = splitByHeadings(e.props.text)
    if (!blocks.some(block => block.kind === 'heading')) return next(e)

    const { Box, Markdown, Text } = $.ui.resolve(e)
    const [first, ...rest] = blocks

    // 返答の先頭の ● と字下げを残すため、最初のまとまりだけ Claude Code 自身に描かせる
    const firstDrawn = await next({ ...e, props: { ...e.props, text: first.text } })

    // ⎺ は行の一番上に描かれるので、─ と同じ細さで見出しの文字に近い位置に線が出る
    const underline = (block: Block) =>
      block.kind === 'heading' ? <Text>{'⎺'.repeat(block.width)}</Text> : null

    return (
      <Box flexDirection="column">
        {firstDrawn}
        <Box flexDirection="column" paddingLeft={2}>
          {underline(first)}
          {rest.map((block, index) => {
            const previous = index === 0 ? first : rest[index - 1]
            // 線の行が見出しと本文の間の空行を兼ねるので、線の直後には空行をあけない
            const marginTop = previous.kind === 'heading' ? 0 : 1
            return (
              <Box flexDirection="column" marginTop={marginTop}>
                <Markdown text={block.text} />
                {underline(block)}
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })
}
