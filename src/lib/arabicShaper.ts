/**
 * Arabic Text Shaping & Bi-directional (Bidi) Reordering Engine
 * Provides pixel-perfect Arabic glyph connectivity (Isolated, Initial, Medial, Final)
 * and Lam-Alef ligatures for real vector PDF and canvas rendering.
 */

// Unicode Arabic Presentation Forms-B and Forms-A mapping
interface ArabicGlyphForms {
  isolated: number;
  final: number;
  initial: number;
  medial: number;
}

const ARABIC_GLYPH_TABLE: Record<number, ArabicGlyphForms> = {
  // Hamza
  0x0621: { isolated: 0xfe80, final: 0xfe80, initial: 0xfe80, medial: 0xfe80 },
  // Alef with Madda Above
  0x0622: { isolated: 0xfe81, final: 0xfe82, initial: 0xfe81, medial: 0xfe82 },
  // Alef with Hamza Above
  0x0623: { isolated: 0xfe83, final: 0xfe84, initial: 0xfe83, medial: 0xfe84 },
  // Waw with Hamza Above
  0x0624: { isolated: 0xfe85, final: 0xfe86, initial: 0xfe85, medial: 0xfe86 },
  // Alef with Hamza Below
  0x0625: { isolated: 0xfe87, final: 0xfe88, initial: 0xfe87, medial: 0xfe88 },
  // Yeh with Hamza Above
  0x0626: { isolated: 0xfe89, final: 0xfe8a, initial: 0xfe8b, medial: 0xfe8c },
  // Alef
  0x0627: { isolated: 0xfe8d, final: 0xfe8e, initial: 0xfe8d, medial: 0xfe8e },
  // Beh
  0x0628: { isolated: 0xfe8f, final: 0xfe90, initial: 0xfe91, medial: 0xfe92 },
  // Teh Marbuta
  0x0629: { isolated: 0xfe93, final: 0xfe94, initial: 0xfe93, medial: 0xfe94 },
  // Teh
  0x062a: { isolated: 0xfe95, final: 0xfe96, initial: 0xfe97, medial: 0xfe98 },
  // Theh
  0x062b: { isolated: 0xfe99, final: 0xfe9a, initial: 0xfe9b, medial: 0xfe9c },
  // Jeem
  0x062c: { isolated: 0xfe9d, final: 0xfe9e, initial: 0xfe9f, medial: 0xfea0 },
  // Hah
  0x062d: { isolated: 0xfea1, final: 0xfea2, initial: 0xfea3, medial: 0xfea4 },
  // Khah
  0x062e: { isolated: 0xfea5, final: 0xfea6, initial: 0xfea7, medial: 0xfea8 },
  // Dal
  0x062f: { isolated: 0xfea9, final: 0xfeaa, initial: 0xfea9, medial: 0xfeaa },
  // Thal
  0x0630: { isolated: 0xfeab, final: 0xfeac, initial: 0xfeab, medial: 0xfeac },
  // Reh
  0x0631: { isolated: 0xfead, final: 0xfeae, initial: 0xfead, medial: 0xfeae },
  // Zain
  0x0632: { isolated: 0xfeaf, final: 0xfeb0, initial: 0xfeaf, medial: 0xfeb0 },
  // Seen
  0x0633: { isolated: 0xfeb1, final: 0xfeb2, initial: 0xfeb3, medial: 0xfeb4 },
  // Sheen
  0x0634: { isolated: 0xfeb5, final: 0xfeb6, initial: 0xfeb7, medial: 0xfeb8 },
  // Sad
  0x0635: { isolated: 0xfeb9, final: 0xfeba, initial: 0xfebb, medial: 0xfebc },
  // Dad
  0x0636: { isolated: 0xfebd, final: 0xfebe, initial: 0xfebf, medial: 0xfec0 },
  // Tah
  0x0637: { isolated: 0xfec1, final: 0xfec2, initial: 0xfec3, medial: 0xfec4 },
  // Zah
  0x0638: { isolated: 0xfec5, final: 0xfec6, initial: 0xfec7, medial: 0xfec8 },
  // Ain
  0x0639: { isolated: 0xfec9, final: 0xfeca, initial: 0xfecb, medial: 0xfecc },
  // Ghain
  0x063a: { isolated: 0xfecd, final: 0xfece, initial: 0xfecf, medial: 0xfed0 },
  // Feh
  0x0641: { isolated: 0xfed1, final: 0xfed2, initial: 0xfed3, medial: 0xfed4 },
  // Qaf
  0x0642: { isolated: 0xfed5, final: 0xfed6, initial: 0xfed7, medial: 0xfed8 },
  // Kaf
  0x0643: { isolated: 0xfed9, final: 0xfeda, initial: 0xfedb, medial: 0xfedc },
  // Lam
  0x0644: { isolated: 0xfedd, final: 0xfede, initial: 0xfedf, medial: 0xfee0 },
  // Meem
  0x0645: { isolated: 0xfee1, final: 0xfee2, initial: 0xfee3, medial: 0xfee4 },
  // Noon
  0x0646: { isolated: 0xfee5, final: 0xfee6, initial: 0xfee7, medial: 0xfee8 },
  // Heh
  0x0647: { isolated: 0xfee9, final: 0xfeea, initial: 0xfeeb, medial: 0xfeec },
  // Waw
  0x0648: { isolated: 0xfeed, final: 0xfeee, initial: 0xfeed, medial: 0xfeee },
  // Alef Maksura
  0x0649: { isolated: 0xfeef, final: 0xfef0, initial: 0xfeef, medial: 0xfef0 },
  // Yeh
  0x064a: { isolated: 0xfef1, final: 0xfef2, initial: 0xfef3, medial: 0xfef4 },
};

// Characters that do not connect to the following letter (right-joining only)
const RIGHT_JOINING_LETTERS = new Set<number>([
  0x0621, // Hamza
  0x0622, // Alef with Madda
  0x0623, // Alef with Hamza Above
  0x0624, // Waw with Hamza
  0x0625, // Alef with Hamza Below
  0x0627, // Alef
  0x0629, // Teh Marbuta
  0x062f, // Dal
  0x0630, // Thal
  0x0631, // Reh
  0x0632, // Zain
  0x0648, // Waw
  0x0649, // Alef Maksura
]);

// Lam-Alef ligatures: Lam (0x0644) followed by Alef variants
const LAM_ALEF_LIGATURES: Record<number, { isolated: number; final: number }> = {
  0x0622: { isolated: 0xfef5, final: 0xfef6 }, // Madda
  0x0623: { isolated: 0xfef7, final: 0xfef8 }, // Hamza Above
  0x0625: { isolated: 0xfef9, final: 0xfefa }, // Hamza Below
  0x0627: { isolated: 0xfefb, final: 0xfefc }, // Plain Alef
};

/**
 * Checks if a Unicode code point is an Arabic character
 */
export function isArabicChar(code: number): boolean {
  return (
    (code >= 0x0600 && code <= 0x06ff) ||
    (code >= 0x0750 && code <= 0x077f) ||
    (code >= 0x08a0 && code <= 0x08ff) ||
    (code >= 0xfb50 && code <= 0xfdff) ||
    (code >= 0xfe70 && code <= 0xfeff)
  );
}

/**
 * Checks if a string contains any Arabic characters
 */
export function hasArabicText(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (isArabicChar(text.charCodeAt(i))) return true;
  }
  return false;
}

/**
 * Shapes an Arabic string by converting standard letters into their contextual glyph forms
 * (isolated, initial, medial, final) and resolving Lam-Alef ligatures.
 */
export function shapeArabicText(input: string): string {
  if (!input || !hasArabicText(input)) {
    return input;
  }

  const result: string[] = [];
  const chars: number[] = [];

  for (let i = 0; i < input.length; i++) {
    chars.push(input.charCodeAt(i));
  }

  for (let i = 0; i < chars.length; i++) {
    const curr = chars[i];

    // Check for Lam-Alef Ligature
    if (curr === 0x0644 && i + 1 < chars.length && LAM_ALEF_LIGATURES[chars[i + 1]]) {
      const alefChar = chars[i + 1];
      const prev = i > 0 ? chars[i - 1] : null;
      const connectsToPrev = prev !== null && ARABIC_GLYPH_TABLE[prev] && !RIGHT_JOINING_LETTERS.has(prev);

      const ligature = LAM_ALEF_LIGATURES[alefChar];
      const glyphCode = connectsToPrev ? ligature.final : ligature.isolated;
      result.push(String.fromCharCode(glyphCode));
      i++; // Skip the next Alef char
      continue;
    }

    const glyphTable = ARABIC_GLYPH_TABLE[curr];
    if (!glyphTable) {
      result.push(String.fromCharCode(curr));
      continue;
    }

    const prev = i > 0 ? chars[i - 1] : null;
    const next = i + 1 < chars.length ? chars[i + 1] : null;

    const connectsToPrev = prev !== null && ARABIC_GLYPH_TABLE[prev] && !RIGHT_JOINING_LETTERS.has(prev);
    const connectsToNext = next !== null && ARABIC_GLYPH_TABLE[next] && !RIGHT_JOINING_LETTERS.has(curr);

    let shapedCode: number;
    if (connectsToPrev && connectsToNext) {
      shapedCode = glyphTable.medial;
    } else if (connectsToPrev) {
      shapedCode = glyphTable.final;
    } else if (connectsToNext) {
      shapedCode = glyphTable.initial;
    } else {
      shapedCode = glyphTable.isolated;
    }

    result.push(String.fromCharCode(shapedCode));
  }

  return result.join('');
}

/**
 * Reorders text for RTL rendering in LTR-only rendering engines (like standard Canvas/basic PDF)
 * Reverses Arabic segments while preserving numbers and Latin words in LTR.
 */
export function bidiReorderForPdf(text: string): string {
  if (!text || !hasArabicText(text)) {
    return text;
  }

  // First, shape the Arabic characters
  const shaped = shapeArabicText(text);

  // Split into tokens: Arabic sequences vs Non-Arabic sequences
  const tokens: Array<{ text: string; isRtl: boolean }> = [];
  let currentToken = '';
  let currentIsRtl: boolean | null = null;

  for (let i = 0; i < shaped.length; i++) {
    const code = shaped.charCodeAt(i);
    const isRtl = isArabicChar(code);

    if (currentIsRtl === null) {
      currentIsRtl = isRtl;
      currentToken += shaped[i];
    } else if (currentIsRtl === isRtl) {
      currentToken += shaped[i];
    } else {
      tokens.push({ text: currentToken, isRtl: currentIsRtl });
      currentToken = shaped[i];
      currentIsRtl = isRtl;
    }
  }
  if (currentToken) {
    tokens.push({ text: currentToken, isRtl: currentIsRtl || false });
  }

  // Reverse Arabic chunks character-by-character, and reverse the overall token order
  const reorderedTokens = tokens.reverse().map((token) => {
    if (token.isRtl) {
      return token.text.split('').reverse().join('');
    }
    return token.text;
  });

  return reorderedTokens.join('');
}
