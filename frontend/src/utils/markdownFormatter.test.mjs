import assert from 'node:assert/strict'
import { formatMarkdown } from './markdownFormatter.mjs'

const markdown = `# 评审结果

- 覆盖核心流程
- 补充异常场景

| 字段 | 说明 |
| --- | --- |
| 优先级 | 高 |

> 结论：可进入测试设计`

const html = formatMarkdown(markdown)

assert.match(html, /<h1>评审结果<\/h1>/)
assert.match(html, /<ul>[\s\S]*<li>覆盖核心流程<\/li>[\s\S]*<li>补充异常场景<\/li>[\s\S]*<\/ul>/)
assert.match(html, /<table>[\s\S]*<thead>[\s\S]*<th>字段<\/th>[\s\S]*<th>说明<\/th>[\s\S]*<\/thead>[\s\S]*<tbody>[\s\S]*<td>优先级<\/td>[\s\S]*<td>高<\/td>[\s\S]*<\/tbody>[\s\S]*<\/table>/)
assert.match(html, /<blockquote>结论：可进入测试设计<\/blockquote>/)

const htmlBreaks = formatMarkdown('1. 查看人员授权范围说明<br>2. 检查风险提示内容')
assert.match(htmlBreaks, /查看人员授权范围说明<br>2\. 检查风险提示内容/)
assert.doesNotMatch(htmlBreaks, /&lt;br&gt;/)

assert.doesNotMatch(html, /<script>/)

console.log('markdownFormatter tests passed')
