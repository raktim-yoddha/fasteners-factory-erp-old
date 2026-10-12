// Code 39: nine alternating bar/space elements, three wide elements per symbol.
// Standard patterns verified against the installed ReportLab implementation.
const patterns: Record<string,string> = {
  '0': 'bsbSBsBsb','1': 'BsbSbsbsB','2': 'bsBSbsbsB','3': 'BsBSbsbsb','4': 'bsbSBsbsB',
  '5': 'BsbSBsbsb','6': 'bsBSBsbsb','7': 'bsbSbsBsB','8': 'BsbSbsBsb','9': 'bsBSbsBsb',
  A: 'BsbsbSbsB',B: 'bsBsbSbsB',C: 'BsBsbSbsb',D: 'bsbsBSbsB',E: 'BsbsBSbsb',F: 'bsBsBSbsb',
  G: 'bsbsbSBsB',H: 'BsbsbSBsb',I: 'bsBsbSBsb',J: 'bsbsBSBsb',K: 'BsbsbsbSB',L: 'bsBsbsbSB',
  M: 'BsBsbsbSb',N: 'bsbsBsbSB',O: 'BsbsBsbSb',P: 'bsBsBsbSb',Q: 'bsbsbsBSB',R: 'BsbsbsBSb',
  S: 'bsBsbsBSb',T: 'bsbsBsBSb',U: 'BSbsbsbsB',V: 'bSBsbsbsB',W: 'BSBsbsbsb',X: 'bSbsBsbsB',
  Y: 'BSbsBsbsb',Z: 'bSBsBsbsb','-': 'bSbsbsBsB','.': 'BSbsbsBsb',' ': 'bSBsbsBsb',
  '*': 'bSbsBsBsb','$': 'bSbSbSbsb','/': 'bSbSbsbSb','+': 'bSbsbSbSb','%': 'bsbSbSbSb',
}
export function code39(value: string): { width: number; bars: { x: number; width: number }[] }|null {
  if (!value || value.length>100 || !/^[0-9A-Z .$/+%-]+$/.test(value)) return null
  let x=10
  const bars: { x: number; width: number }[]=[]
  const symbols=`*${value}*`
  for (const [index,symbol] of [...symbols].entries()) {
    for (const element of patterns[symbol]!) {
      const width=element===element.toUpperCase() ? 3 : 1
      if (element.toLowerCase()==='b') bars.push({ x,width })
      x+=width
    }
    if (index<symbols.length-1) x+=1
  }
  return { width: x+10,bars }
}
