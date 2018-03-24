import { normalizeString } from './normalize';

describe('normalizeString', () => {
  const testCases = [
    { input: 'オイシイｶﾚｰの作り方', expectation: 'オイシイカレーの作り方' },
    { input: 'Ｈｏｗ　Ｔｏ　Ｃｒｅａｔｅ　＃１', expectation: 'how to create #1' },
    { input: '冷た〜い～温か〜い！', expectation: '冷た〜い~温か〜い!' },
    { input: '1　: ２の比率で', expectation: '1 : 2の比率で' },
    { input: '醤油：　大さじ１', expectation: '醤油 大さじ1' },
    { input: 'ABC…120g', expectation: 'abc120g' },
  ];
  it('should normalize string as expected', () => testCases.forEach(({ input, expectation }) =>
    expect(normalizeString(input)).toBe(expectation)
  ));
});