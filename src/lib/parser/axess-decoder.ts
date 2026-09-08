/**
 * Akbank Axess Type3 font reverse-engineered mapping.
 * Akbank credit card statements use custom unmapped Type3 glyphs with shifted byte codes
 * and micro-kerning spaces.
 */
export const exactAxessMap: Record<number, string> = {
  // Digits
  0xf0: '0',
  0xf1: '1',
  0xf2: '2',
  0xf3: '3',
  0xf4: '4',
  0xf5: '5',
  0xf6: '6',
  0xf7: '7',
  0xf8: '8',
  0xf9: '9',

  // Punctuation
  0x40: ' ',
  0x4b: '.',
  0x6b: ',',
  0x61: '/',
  0x7a: ':',
  0x4d: '(',
  0x5d: ')',
  0x60: '-',
  0x5c: '*',
  0x3d: '-',
  0x5e: ':',

  // Lowercase
  0x81: 'a',
  0x82: 'b',
  0x83: 'c',
  0x48: 'ç',
  0x84: 'd',
  0x85: 'e',
  0x86: 'f',
  0x87: 'g',
  0xba: 'ğ',
  0x88: 'h',
  0xae: 'ı',
  0xa6: 'ı',
  0x89: 'i',
  0x92: 'k',
  0x93: 'l',
  0x94: 'm',
  0x95: 'n',
  0x96: 'o',
  0xec: 'ö',
  0x97: 'p',
  0x99: 'r',
  0xa2: 's',
  0xbd: 'ş',
  0xbb: 'ş',
  0xac: 'ş',
  0xa3: 't',
  0xa4: 'u',
  0xdc: 'ü',
  0xfc: 'ü',
  0xa5: 'v',
  0xa7: 'x',
  0xa8: 'y',
  0xa9: 'z',

  // Uppercase
  0xc1: 'A',
  0xc2: 'B',
  0xc3: 'C',
  0x68: 'Ç',
  0xc4: 'D',
  0xc5: 'E',
  0xc6: 'F',
  0xc7: 'G',
  0xc8: 'H',
  0xab: 'I',
  0xc9: 'İ',
  0xaa: 'İ',
  0xbc: 'İ',
  0xd2: 'K',
  0xd3: 'L',
  0xd4: 'M',
  0xd5: 'N',
  0xd6: 'O',
  0xcc: 'Ö',
  0xd7: 'P',
  0xd9: 'R',
  0xe2: 'S',
  0xc0: 'Ş',
  0xe3: 'T',
  0xe4: 'U',
  0xe5: 'V',
  0xe8: 'Y',
  0xe9: 'Z',
}

export function decodeAxess(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    if (exactAxessMap[code] !== undefined) {
      out += exactAxessMap[code]
    } else {
      out += raw[i]
    }
  }
  return out
}

export function isAxessPage(items: Array<{ str: string; transform: number[] }>): boolean {
  let c1Count = 0
  for (const it of items) {
    if (!it.str) continue
    if (it.str.includes('Á§…') || it.str.includes('ÈÅ×')) return true
    for (let i = 0; i < it.str.length; i++) {
      const code = it.str.charCodeAt(i)
      // C1 control character range used uniquely by Axess Type3 font
      if (code >= 0x80 && code <= 0x9f) {
        c1Count++
        if (c1Count >= 5) return true
      }
    }
  }
  return false
}
