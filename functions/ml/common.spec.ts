import { normalizeString, TokenizerWrapper } from './common';

describe('TokenizerWrapper', () => {
  const testCases = [
    { input: ['1', '2', '3', '4'], expectation: ['1234'] },
    { input: ['1', 'foo', '2', '3', 'bar', '4'], expectation: ['1', 'foo', '23', 'bar', '4'] },
    { input: ['1', 'foo', '2', '3', ',', '4', '5', 'bar', '6'], expectation: ['1', 'foo', '23,45', 'bar', '6'] },
    { input: ['1', 'foo', '2', '3', '.', '4', '5', 'bar', '6'], expectation: ['1', 'foo', '23.45', 'bar', '6'] },
    { input: ['1', 'foo', '2', '3', ':', '4', '5', 'bar', '6'], expectation: ['1', 'foo', '23:45', 'bar', '6'] },
    { input: ['1', 'foo', '2', '3', '/', '4', '5', 'bar', '6'], expectation: ['1', 'foo', '23/45', 'bar', '6'] },
    { input: ['1', 'foo', '2', '3', ',', 'bar', '4'], expectation: ['1', 'foo', '23', ',', 'bar', '4'] },
    { input: ['1', 'foo', '.', '2', '3', 'bar', '4'], expectation: ['1', 'foo', '.', '23', 'bar', '4'] },
    { input: ['1', 'foo', '2', '3', ':', '/', '4', '5', 'bar', '6'], expectation: ['1', 'foo', '23', ':', '/', '45', 'bar', '6'] },
  ];
  it('should concatenate numbers and symbols as expected', () => testCases.forEach(({ input, expectation }) =>
    expect(new TokenizerWrapper({ tokenize: () => input.map(surface_form => ({ surface_form })) } as any).tokenize('')).toEqual(expectation)
  ));
});

describe('normalizeString', () => {
  const testCases = [
    { input: 'オイシイｶﾚｰの作り方', expectation: 'オイシイカレーの作り方' },
    { input: 'Ｈｏｗ　Ｔｏ　Ｃｒｅａｔｅ　＃１', expectation: 'how to create #1' },
    { input: '冷た〜い～温か〜い！', expectation: '冷た〜い~温か〜い!' },
    { input: '1　: ２の比率で', expectation: '1 : 2の比率で' },
    { input: '醤油：　大さじ１', expectation: '醤油 大さじ1' },
    { input: '…120g', expectation: '120g' },
  ];
  it('should normalize string as expected', () => testCases.forEach(({ input, expectation }) =>
    expect(normalizeString(input)).toBe(expectation)
  ));
});