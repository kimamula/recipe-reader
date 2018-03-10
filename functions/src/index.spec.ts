import { getMaterialQuantity, longestCommonSubstringRatio } from './index';

describe('getMaterialQuantity', () => {
  it('should return corresponding quantity for the material', () =>
    getMaterialQuantity({ '豚肉': '100g', 'キャベツ': '1/2個', '生姜': 'ひとかけ' }, '生姜', longestCommonSubstringRatio)
      .then(result => expect(result).toBe('ひとかけ'))
  );
  it('should return the best match quantity for the material if there is no material name that matches exactly to the argument', () =>
    Promise.all([
      getMaterialQuantity({ '豚肉': '100g', 'キャベツ': '1/2個', '生姜': 'ひとかけ' }, 'ブタ肉', longestCommonSubstringRatio)
        .then(result => expect(result).toBe('100g')),
      getMaterialQuantity({ '100g100円の豚肉': '100g', '100g1000円の高級牛肉': '200g', 'キャベツ': '1/2個', '生姜': 'ひとかけ' }, '100g100円の高級牛肉', longestCommonSubstringRatio)
        .then(result => expect(result).toBe('200g')),
    ])
  );
});

describe('longestCommonSubstringRatio', () => {
  it('should return longest common substring ratio of strings', () => {
    expect(longestCommonSubstringRatio('foo', 'foo')).toBe(1);
    expect(longestCommonSubstringRatio('foo', 'bar')).toBe(0);
    expect(longestCommonSubstringRatio('foobar', 'foo')).toBe((3 / 6) * 1);
    expect(longestCommonSubstringRatio('foo', 'barfoo')).toBe(1 * (3 / 6));
    expect(longestCommonSubstringRatio('あいうえおかきくけこ', 'いうかきくけ')).toBe((4 / 10) * (4 / 6));
  });
});