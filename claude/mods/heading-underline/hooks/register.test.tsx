import { expect, test } from 'claude-code/testing'

const mountReply = ($: any, text: string) =>
  $.ui.mount({
    plugin: 'heading-underline',
    component: 'AssistantMessage',
    surface: 'terminal',
    props: { text, isFirstOfReply: true },
  })

test('見出しの下に、見出しと同じ幅の線を引く', async ($, on) => {
  // Claude Code 自身の描画の代わり
  on('ui.render', ($, e) => {
    const { Markdown } = $.ui.resolve(e)
    return <Markdown text={e.props.text} />
  })

  const ui = await mountReply($, '前の文\n\n## 見出し A\n\n本文\n\n```\n## コードの中\n```')

  expect((await ui.find({ type: 'Text', text: /^⎺+$/ }))?.text).toBe('⎺'.repeat(8))
  expect(await ui.find({ type: 'Markdown', text: '前の文' })).toBeTruthy()
  expect(await ui.find({ type: 'Markdown', text: /コードの中/ })).toBeTruthy()
  await ui.unmount()
})
