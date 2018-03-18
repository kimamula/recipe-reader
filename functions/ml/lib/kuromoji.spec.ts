import { TokenizerWrapper } from './kuromoji';

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