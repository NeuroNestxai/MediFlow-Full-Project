import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { I18nProvider, translate, useI18n, dirFor, langFromUrl } from '../i18n/i18n';

describe('translate', () => {
  it('interpolates variables', () => {
    expect(translate({ hi: 'Hello {name}, you have {n} orders' }, 'hi', { name: 'Salim', n: 3 })).toBe('Hello Salim, you have 3 orders');
  });
  it('falls back to the fallback dictionary and then the key', () => {
    expect(translate({}, 'a', undefined, { a: 'A' })).toBe('A');
    expect(translate({}, 'missing.key')).toBe('missing.key');
  });
  it('keeps unknown placeholders', () => {
    expect(translate({ x: '{a} {b}' }, 'x', { a: 1 })).toBe('1 {b}');
  });
  it('maps languages to directions', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
  });
});

function Probe() {
  const { t, lang, toggleLang, money, pick } = useI18n();
  return (
    <div>
      <span data-testid="greet">{t('greet')}</span>
      <span data-testid="lang">{lang}</span>
      <span data-testid="money">{money(2500)}</span>
      <span data-testid="pick">{pick('Karak', 'كرك')}</span>
      <span data-testid="common">{t('order.status.placed')}</span>
      <button onClick={toggleLang}>toggle</button>
    </div>
  );
}

describe('I18nProvider', () => {
  it('switches language, direction and persists the choice', () => {
    localStorage.clear();
    render(
      <I18nProvider storageKey="test.lang" defaultLang="ar" dictionaries={{ ar: { greet: 'مرحبا' }, en: { greet: 'Hello' } }}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('greet')).toHaveTextContent('مرحبا');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(screen.getByTestId('money')).toHaveTextContent('٢٫٥٠٠ ر.ع.');
    expect(screen.getByTestId('pick')).toHaveTextContent('كرك');
    expect(screen.getByTestId('common')).toHaveTextContent('جديد');
    act(() => screen.getByText('toggle').click());
    expect(screen.getByTestId('greet')).toHaveTextContent('Hello');
    expect(document.documentElement.dir).toBe('ltr');
    expect(screen.getByTestId('money')).toHaveTextContent('OMR 2.500');
    expect(JSON.parse(localStorage.getItem('test.lang')!)).toBe('en');
  });

  it('honours ?lang=ar|en on first load and remembers it', () => {
    expect(langFromUrl('?lang=en')).toBe('en');
    expect(langFromUrl('?x=1&lang=AR')).toBe('ar');
    expect(langFromUrl('?lang=fr')).toBeNull();
    expect(langFromUrl('')).toBeNull();
    localStorage.clear();
    window.history.replaceState(null, '', '/stores?lang=en');
    try {
      render(
        <I18nProvider storageKey="test.lang" defaultLang="ar" dictionaries={{ ar: { greet: 'مرحبا' }, en: { greet: 'Hello' } }}>
          <Probe />
        </I18nProvider>,
      );
      expect(screen.getByTestId('lang')).toHaveTextContent('en');
      expect(screen.getByTestId('greet')).toHaveTextContent('Hello');
      expect(JSON.parse(localStorage.getItem('test.lang')!)).toBe('en');
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});
