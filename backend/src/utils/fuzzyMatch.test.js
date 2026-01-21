/**
 * Fuzzy Match Utility Tests
 *
 * Test suite for enhanced fuzzy matching algorithms
 */

const {
  levenshteinDistance,
  levenshteinSimilarity,
  jaroWinklerSimilarity,
  ngramSimilarity,
  tokenSimilarity,
  phoneticMatch,
  fuzzyMatch,
  findBestMatch,
  findAllMatches,
} = require('./fuzzyMatch');

describe('Fuzzy Match Utility', () => {
  describe('levenshteinDistance', () => {
    test('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    test('should return correct edit distance', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
    });

    test('should handle empty strings', () => {
      expect(levenshteinDistance('', 'hello')).toBe(5);
      expect(levenshteinDistance('hello', '')).toBe(5);
    });
  });

  describe('levenshteinSimilarity', () => {
    test('should return 1 for identical strings', () => {
      expect(levenshteinSimilarity('hello', 'hello')).toBe(1);
    });

    test('should return similarity between 0 and 1', () => {
      const sim = levenshteinSimilarity('A106', 'A105');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });
  });

  describe('jaroWinklerSimilarity', () => {
    test('should return 1 for identical strings', () => {
      expect(jaroWinklerSimilarity('ASTM', 'ASTM')).toBe(1);
    });

    test('should favor common prefixes', () => {
      const sim1 = jaroWinklerSimilarity('ASTM A106', 'ASTM A105');
      const sim2 = jaroWinklerSimilarity('A106 ASTM', 'A105 ASTM');
      expect(sim1).toBeGreaterThan(sim2); // Prefix bonus
    });
  });

  describe('ngramSimilarity', () => {
    test('should return 1 for identical strings', () => {
      expect(ngramSimilarity('PIPE', 'PIPE')).toBe(1);
    });

    test('should detect character sequence overlap', () => {
      const sim = ngramSimilarity('SEAMLESS', 'SEAML');
      expect(sim).toBeGreaterThan(0.5);
    });
  });

  describe('tokenSimilarity', () => {
    test('should match regardless of word order', () => {
      const sim = tokenSimilarity('ASTM A106 GR.B', 'GR.B A106 ASTM');
      expect(sim).toBe(1); // All tokens match
    });

    test('should handle partial token overlap', () => {
      const sim = tokenSimilarity('PIPE SEAMLESS SCH40', 'PIPE WELDED SCH40');
      expect(sim).toBeGreaterThan(0.5); // 2 out of 3 tokens match
    });
  });

  describe('phoneticMatch', () => {
    test('should match phonetically similar words', () => {
      expect(phoneticMatch('smith', 'smyth')).toBe(true);
      expect(phoneticMatch('john', 'jon')).toBe(true);
    });

    test('should not match phonetically different words', () => {
      expect(phoneticMatch('steel', 'alloy')).toBe(false);
    });
  });

  describe('fuzzyMatch', () => {
    test('should return 1 for identical strings', () => {
      expect(fuzzyMatch('A106 GR.B', 'A106 GR.B')).toBe(1);
    });

    test('should handle material code variations', () => {
      const sim = fuzzyMatch('ASTM A106 GR.B', 'A106B');
      expect(sim).toBeGreaterThan(0.4); // Should detect similarity despite format difference
    });

    test('should handle typos', () => {
      const sim = fuzzyMatch('SEAMLESS', 'SEAMLES'); // Missing 'S'
      expect(sim).toBeGreaterThan(0.8);
    });

    test('should handle abbreviations', () => {
      const sim = fuzzyMatch('SCH40', 'SCHEDULE 40');
      expect(sim).toBeGreaterThan(0.3);
    });
  });

  describe('findBestMatch', () => {
    test('should find best match from candidates', () => {
      const query = 'A106 GR.B';
      const candidates = ['A105', 'A106 GRB', 'A333 GR.6', 'A106 GR.A'];
      const match = findBestMatch(query, candidates, 0.5);

      expect(match).not.toBeNull();
      expect(match.value).toBe('A106 GRB');
      expect(match.score).toBeGreaterThan(0.7);
    });

    test('should return null if no match above threshold', () => {
      const query = 'A106';
      const candidates = ['B16.5', 'B16.9', 'B16.47'];
      const match = findBestMatch(query, candidates, 0.8);

      expect(match).toBeNull();
    });

    test('should handle empty candidates', () => {
      const match = findBestMatch('A106', [], 0.5);
      expect(match).toBeNull();
    });
  });

  describe('findAllMatches', () => {
    test('should find all matches above threshold', () => {
      const query = 'PIPE';
      const candidates = ['PIPE SEAMLESS', 'PIPE WELDED', 'FLANGE', 'FITTING'];
      const matches = findAllMatches(query, candidates, 0.4);

      expect(matches.length).toBeGreaterThanOrEqual(2); // At least PIPE SEAMLESS and PIPE WELDED
      expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score); // Sorted by score
    });

    test('should return empty array if no matches', () => {
      const query = 'ZZZZ';
      const candidates = ['PIPE', 'FLANGE', 'FITTING'];
      const matches = findAllMatches(query, candidates, 0.8);

      expect(matches).toEqual([]);
    });
  });

  describe('Real-world material matching scenarios', () => {
    test('should match pipe specifications', () => {
      const query = '6" SCH40 ASTM A106 GR.B SEAMLESS';
      const candidates = [
        'PIPE-6IN-40-SMLS-A106GRB',
        'PIPE-6IN-80-SMLS-A106GRB',
        'PIPE-8IN-40-SMLS-A106GRB',
        'PIPE-6IN-40-ERW-A53GRB',
      ];

      const match = findBestMatch(query, candidates, 0.3);
      expect(match).not.toBeNull();
      expect(match.value).toBe('PIPE-6IN-40-SMLS-A106GRB');
    });

    test('should match flange specifications', () => {
      const query = 'WELD NECK FLANGE 6" 150# ASTM A105';
      const candidates = [
        'FLNG-6IN-WNRF-150-B165-A105',
        'FLNG-6IN-SORF-150-B165-A105',
        'FLNG-6IN-WNRF-300-B165-A105',
      ];

      const match = findBestMatch(query, candidates, 0.3);
      expect(match).not.toBeNull();
      expect(match.value).toBe('FLNG-6IN-WNRF-150-B165-A105');
    });

    test('should match with abbreviated material codes', () => {
      const query = 'SS316L';
      const candidates = [
        'A182F316L',
        'A312TP316L',
        'A105',
        'A350LF2',
      ];

      const match = findBestMatch(query, candidates, 0.3);
      expect(match).not.toBeNull();
      expect(match.value).toContain('316L');
    });
  });
});
