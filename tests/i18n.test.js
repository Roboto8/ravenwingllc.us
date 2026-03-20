/**
 * Tests for internationalization (i18n) system.
 * Verifies all languages have complete translations and no missing keys.
 */

const fs = require('fs');
const path = require('path');

// Mock browser globals before eval
global.localStorage = { getItem: () => 'en', setItem: () => {} };
global.document = { querySelectorAll: () => [], documentElement: { lang: 'en' } };

// Load i18n.js and extract the I18N object
const i18nSource = fs.readFileSync(path.join(__dirname, '..', 'client', 'preview', 'js', 'i18n.js'), 'utf8');
eval(i18nSource);

// I18N has _lang plus language keys — extract just the language objects
const langIgnore = ['_lang'];
const allLanguages = Object.keys(I18N).filter(k => !langIgnore.includes(k) && typeof I18N[k] === 'object');
const TRANSLATIONS = I18N;
const englishKeys = Object.keys(TRANSLATIONS.en);

describe('i18n translations', () => {

  test('English (en) is the base language', () => {
    expect(TRANSLATIONS.en).toBeDefined();
    expect(englishKeys.length).toBeGreaterThan(100);
  });

  test('all expected languages are present', () => {
    expect(allLanguages).toContain('en');
    expect(allLanguages).toContain('es');
    expect(allLanguages).toContain('nl');
    expect(allLanguages).toContain('fr');
    expect(allLanguages).toContain('de');
    expect(allLanguages).toContain('pt');
  });

  // For each non-English language, verify all keys exist
  allLanguages.filter(l => l !== 'en').forEach(lang => {
    describe(`${lang.toUpperCase()} translations`, () => {
      const langKeys = Object.keys(TRANSLATIONS[lang]);

      test('has all English keys', () => {
        const missing = englishKeys.filter(k => !TRANSLATIONS[lang].hasOwnProperty(k));
        if (missing.length > 0) {
          fail(`${lang} is missing ${missing.length} keys: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}`);
        }
      });

      test('has no extra keys not in English', () => {
        const extra = langKeys.filter(k => !TRANSLATIONS.en.hasOwnProperty(k));
        if (extra.length > 0) {
          fail(`${lang} has ${extra.length} extra keys not in en: ${extra.join(', ')}`);
        }
      });

      test('no empty string values', () => {
        const empty = langKeys.filter(k => TRANSLATIONS[lang][k] === '');
        if (empty.length > 0) {
          fail(`${lang} has ${empty.length} empty values: ${empty.slice(0, 10).join(', ')}`);
        }
      });

      test('no untranslated values (same as English)', () => {
        // Allow some keys to match English (brand names, abbreviations, etc.)
        const allowSameAsEnglish = ['pdf_title', 'gate_marker_label', 'pdf_subtitle'];
        const untranslated = langKeys.filter(k =>
          TRANSLATIONS[lang][k] === TRANSLATIONS.en[k] &&
          !allowSameAsEnglish.includes(k) &&
          // Skip short values that could legitimately be the same
          TRANSLATIONS.en[k].length > 3
        );
        // Warn but don't fail — some terms may legitimately be the same
        if (untranslated.length > englishKeys.length * 0.1) {
          fail(`${lang} has ${untranslated.length} values identical to English (>10% of keys) — likely untranslated`);
        }
      });

      test('template variables match English', () => {
        // Check that {variable} placeholders in translations match the English ones
        const varPattern = /\{(\w+)\}/g;
        const mismatched = [];
        englishKeys.forEach(k => {
          if (!TRANSLATIONS[lang][k]) return;
          const enVars = (TRANSLATIONS.en[k].match(varPattern) || []).sort();
          const langVars = (TRANSLATIONS[lang][k].match(varPattern) || []).sort();
          if (JSON.stringify(enVars) !== JSON.stringify(langVars)) {
            mismatched.push({ key: k, en: enVars, [lang]: langVars });
          }
        });
        if (mismatched.length > 0) {
          fail(`${lang} has mismatched template variables in: ${mismatched.map(m => m.key).join(', ')}`);
        }
      });
    });
  });

  // Verify the HTML dropdown matches available languages
  describe('language dropdown', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'client', 'preview', 'index.html'), 'utf8');

    test('dropdown has an option for each language', () => {
      allLanguages.forEach(lang => {
        const pattern = new RegExp(`<option value="${lang}">`);
        expect(indexHtml).toMatch(pattern);
      });
    });

    test('dropdown has no options for missing languages', () => {
      const optionPattern = /value="(\w+)"/g;
      let match;
      const dropdownLangs = [];
      // Find options within the lang-select element
      const selectMatch = indexHtml.match(/id="lang-select"[^>]*>[\s\S]*?<\/select>/);
      if (selectMatch) {
        while ((match = optionPattern.exec(selectMatch[0])) !== null) {
          dropdownLangs.push(match[1]);
        }
      }
      dropdownLangs.forEach(lang => {
        expect(TRANSLATIONS).toHaveProperty(lang);
      });
    });
  });
});
