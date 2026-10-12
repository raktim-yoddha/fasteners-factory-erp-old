/** Strict CSV with quoted commas/newlines; no locale-dependent number conversion. */
export function parseCsv(source: string, maxRows = 501): string[][] {
  if (source.length>1048576) throw new Error('CSV exceeds the 1 MiB limit.')
  const text=source.replace(/^\uFEFF/,''), rows: string[][]=[], row: string[]=[], field: string[]=[]
  let quoted=false,closed=false,started=false
  const finishField=() => { row.push(field.join(''));field.length=0;closed=false;started=false }
  const finishRow=() => { finishField();rows.push([...row]);row.length=0;if (rows.length>maxRows) throw new Error(`CSV exceeds ${maxRows-1} data rows.`) }
  for (let i=0;i<text.length;i++) {
    const c=text[i]!
    if (quoted) {
      if (c==='"') { if (text[i+1]==='"') { field.push('"');i++ } else { quoted=false;closed=true } }
      else field.push(c)
    } else if (c===',') finishField()
    else if (c==='\n' || c==='\r') { if (c==='\r' && text[i+1]==='\n') i++;finishRow() }
    else if (c==='"') { if (started || closed) throw new Error('Unexpected quote in CSV. Quote the whole field.');quoted=true;started=true }
    else { if (closed) throw new Error('Unexpected text after a quoted CSV field.');field.push(c);started=true }
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.')
  if (field.length || row.length || started || closed) finishRow()
  if (!rows.length) throw new Error('CSV is empty.')
  return rows
}
export function writeCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const cell=(value: unknown) => {
    let text=value==null ? '' : String(value)
    // Keep signed exact decimals usable while neutralizing spreadsheet formulas in free text.
    if (/^[\s]*[=+\-@]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text)) text=`'${text}`
    return `"${text.replaceAll('"','""')}"`
  }
  return '\uFEFF'+[headers.map(cell).join(','),...rows.map((row) => headers.map((key) => cell(row[key])).join(','))].join('\r\n')+'\r\n'
}
