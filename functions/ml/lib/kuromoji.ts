import kuromoji, { IpadicFeatures, Tokenizer } from 'kuromoji';
import path from 'path';

const tokenizeInterruptionNumberTarget = /^\d+$/;
const tokenizeInterruptionSymbolTarget = /^[:/,.]$/;
const tokenizeInterruptionTarget = /(^\d+$)|(^[:/,.]$)/;
export class TokenizerWrapper {
  tokenize(text: string): string[] {
    // prevent words like "1,000", "2.5" or "12/26" to be separated by symbols inside them.
    const tokenized = this.tokenizer.tokenize(text);
    const length = tokenized.length;
    return tokenized.reduce((acc, { surface_form }, i) => {
      const match = surface_form.match(tokenizeInterruptionTarget);
      if (!match) {
        return [...acc, surface_form];
      }
      if (match[1]) {
        if (tokenizeInterruptionNumberTarget.test(tokenized[i - 1] && tokenized[i - 1].surface_form)
          || tokenizeInterruptionSymbolTarget.test(tokenized[i - 1] && tokenized[i - 1].surface_form)
          && tokenizeInterruptionNumberTarget.test(tokenized[i - 2] && tokenized[i - 2].surface_form)) {
          // number following another number should be filtered
          return acc;
        }
        let immediatelyAfterSymbol = false;
        while (i < length - 1) {
          i += 1;
          const next = tokenized[i];
          if (tokenizeInterruptionNumberTarget.test(next.surface_form)) {
            immediatelyAfterSymbol = false;
            surface_form += next.surface_form;
            continue;
          }
          if (immediatelyAfterSymbol) {
            surface_form = surface_form.slice(0, -1);
            break;
          }
          if (tokenizeInterruptionSymbolTarget.test(next.surface_form)) {
            immediatelyAfterSymbol = true;
            surface_form += next.surface_form;
            continue;
          }
          break;
        }
        return [...acc, surface_form];
      }
      if (match[2]) {
        // Symbols between number should be filtered
        return tokenizeInterruptionNumberTarget.test(tokenized[i - 1] && tokenized[i - 1].surface_form)
        && tokenizeInterruptionNumberTarget.test(tokenized[i + 1] && tokenized[i + 1].surface_form)
          ? acc : [...acc, surface_form];
      }
      throw new Error('Unreachable');
    }, [] as string[]);
  }

  constructor(public tokenizer: Tokenizer<IpadicFeatures>) { }
}
export async function createKuromojiTokenizer(): Promise<TokenizerWrapper> {
  return new Promise<TokenizerWrapper>((resolve, reject) => kuromoji
    .builder({ dicPath: path.resolve(__dirname, '../../node_modules/kuromoji/dict/') })
    .build((err, tokenizer) => err ? reject(err) : resolve(new TokenizerWrapper(tokenizer)))
  );
}