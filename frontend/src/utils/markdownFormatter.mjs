function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatInline(value) {
  let html = escapeHtml(value).replace(/&lt;br\s*\/?&gt;/gi, '<br>')
  const inlineCode = []

  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@INLINE_CODE_${inlineCode.length}@@`
    inlineCode.push(`<code>${code}</code>`)
    return token
  })

  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|\s)\*([^*]+?)\*(?=\s|$|[，。,.!?])/g, '$1<em>$2</em>')
    .replace(/(^|\s)_([^_]+?)_(?=\s|$|[，。,.!?])/g, '$1<em>$2</em>')

  inlineCode.forEach((code, index) => {
    html = html.replace(`@@INLINE_CODE_${index}@@`, code)
  })

  return html
}

function isTableSeparator(line) {
  const cells = splitTableCells(line)
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.trim()))
}

function splitTableCells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

function renderTable(lines) {
  const headerCells = splitTableCells(lines[0])
  const bodyRows = lines.slice(2).map(splitTableCells)

  const header = headerCells.map(cell => `<th>${formatInline(cell)}</th>`).join('')
  const body = bodyRows
    .map(row => `<tr>${row.map(cell => `<td>${formatInline(cell)}</td>`).join('')}</tr>`)
    .join('')

  return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`
}

function isUnorderedListItem(line) {
  return /^\s*[-*+]\s+/.test(line)
}

function isOrderedListItem(line) {
  return /^\s*\d+[.)]\s+/.test(line)
}

function renderList(lines, ordered) {
  const tag = ordered ? 'ol' : 'ul'
  const markerPattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/
  const items = lines
    .map(line => `<li>${formatInline(line.replace(markerPattern, '').trim())}</li>`)
    .join('')

  return `<${tag}>${items}</${tag}>`
}

function renderParagraph(lines) {
  return `<p>${lines.map(line => formatInline(line.trim())).join('<br>')}</p>`
}

export function formatMarkdown(content) {
  if (!content) return ''

  const normalizedContent = String(content)
    .replace(/\r\n/g, '\n')
    .replace(/\*\*新增\*\*-/g, '')
    .replace(/新增-/g, '')

  const lines = normalizedContent.split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      const codeLines = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }

    if (trimmed.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const tableLines = [line, lines[index + 1]]
      index += 2
      while (index < lines.length && lines[index].trim().includes('|')) {
        tableLines.push(lines[index])
        index += 1
      }
      blocks.push(renderTable(tableLines))
      continue
    }

    if (isUnorderedListItem(line)) {
      const listLines = []
      while (index < lines.length && isUnorderedListItem(lines[index])) {
        listLines.push(lines[index])
        index += 1
      }
      blocks.push(renderList(listLines, false))
      continue
    }

    if (isOrderedListItem(line)) {
      const listLines = []
      while (index < lines.length && isOrderedListItem(lines[index])) {
        listLines.push(lines[index])
        index += 1
      }
      blocks.push(renderList(listLines, true))
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = []
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push(`<blockquote>${quoteLines.map(formatInline).join('<br>')}</blockquote>`)
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      blocks.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`)
      index += 1
      continue
    }

    if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) {
      blocks.push('<hr>')
      index += 1
      continue
    }

    const paragraphLines = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith('```') &&
      !(lines[index].trim().includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) &&
      !isUnorderedListItem(lines[index]) &&
      !isOrderedListItem(lines[index]) &&
      !/^>\s?/.test(lines[index].trim()) &&
      !/^(#{1,6})\s+/.test(lines[index].trim()) &&
      !/^([-*_])(?:\s*\1){2,}$/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index])
      index += 1
    }
    blocks.push(renderParagraph(paragraphLines))
  }

  return blocks.join('\n')
}
