/** Browser download boundary for operator-requested, non-statutory data files. */
export function downloadText(name: string, text: string, mimeType='text/csv;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([text],{ type: mimeType })),link=document.createElement('a')
  link.href=url;link.download=name;link.click();URL.revokeObjectURL(url)
}
