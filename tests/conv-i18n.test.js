/*
 * Echter End-to-End-Test für den Gesprächsmodus (Feature: lokalisierte Box-Beschriftungen).
 *
 * Lädt die reale index.html in einem echten Chromium (Playwright) und prüft OHNE
 * API-Schlüssel und OHNE localStorage-Seeding, dass jede Box in ihrer eigenen
 * gewählten Sprache beschriftet wird – aus dem fest eingebauten Wörterbuch
 * (CONV_UI_LABELS). Genau der Fall, der zuvor auf Deutsch hängenblieb:
 *   1. Default: Box A Deutsch, Box B Englisch.
 *   2. Der "Löschen"-Button existiert in beiden Boxen.
 *   3. Box A auf Türkisch  -> nur Box A wechselt.
 *   4. Box B auf Französisch -> nur Box B wechselt, Box A bleibt Türkisch.
 *
 * Ausführen:  npm test
 * Chromium:   In Claude-Code-Web automatisch gefunden. Lokal ggf.
 *             PLAYWRIGHT_CHROMIUM_PATH=/pfad/zu/chrome  setzen.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');

function resolveChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  var base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    var dirs = fs.readdirSync(base).filter(function(d) { return d.indexOf('chromium') === 0; });
    for (var i = 0; i < dirs.length; i++) {
      var p = path.join(base, dirs[i], 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch (e) {}
  return undefined; // Playwright versucht dann seinen Standard-Browser
}

var checks = [];
function expect(name, actual, expected) {
  checks.push({ name: name, ok: actual === expected, actual: actual, expected: expected });
}

(async () => {
  var exe = resolveChromium();
  var browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  var ctx = await browser.newContext();
  var page = await ctx.newPage();
  var pageErrors = [];
  page.on('pageerror', function(e) { pageErrors.push(e.message); });

  // Bewusst KEIN Seeding und KEIN API-Schlüssel – der Test prüft das statische Wörterbuch.
  await page.goto(INDEX, { waitUntil: 'load' });
  await page.evaluate(function() { showConversationMode(); });
  await page.waitForTimeout(300);

  var read = function(sel) { return page.$eval(sel, function(el) { return (el.textContent || '').trim(); }); };

  // 1) Default – Box A Deutsch, Box B Englisch
  expect('A person label (DE)', await read('#convPersonLabelA'), 'Person A');
  expect('A trans label (DE)', await read('#convTransLabelA'), '↓ Übersetzung für A');
  expect('A hold label (DE)', await read('#convHoldA .conv-hold-lbl'), 'Halten zum Sprechen');
  expect('A clear button (DE)', await read('#convClearA .conv-clear-lbl'), 'Löschen');
  expect('B person label (EN)', await read('#convPersonLabelB'), 'Person B');
  expect('B trans label (EN)', await read('#convTransLabelB'), '↓ Translation for B');
  expect('B hold label (EN)', await read('#convHoldB .conv-hold-lbl'), 'Hold to speak');
  expect('B clear button (EN)', await read('#convClearB .conv-clear-lbl'), 'Clear');

  // 2) Löschen-Button existiert in beiden Boxen
  expect('A clear button exists', String((await page.$('#convClearA')) !== null), 'true');
  expect('B clear button exists', String((await page.$('#convClearB')) !== null), 'true');

  // 3) Box A auf Türkisch – nur A wechselt (statisch, ohne API)
  await page.selectOption('#convLangA', 'Türkisch');
  await page.waitForTimeout(200);
  expect('A person label (TR)', await read('#convPersonLabelA'), 'Kişi A');
  expect('A trans label (TR)', await read('#convTransLabelA'), '↓ Çeviri A');
  expect('A hold label (TR)', await read('#convHoldA .conv-hold-lbl'), 'Konuşmak için basılı tutun');
  expect('A clear button (TR)', await read('#convClearA .conv-clear-lbl'), 'Temizle');
  expect('A status ready (TR)', await read('#convAStatus'), 'Hazır');

  // 4) Box B auf Französisch – DER gemeldete Fall. Nur B wechselt, A bleibt Türkisch.
  await page.selectOption('#convLangB', 'Französisch');
  await page.waitForTimeout(200);
  expect('B person label (FR)', await read('#convPersonLabelB'), 'Personne B');
  expect('B trans label (FR)', await read('#convTransLabelB'), '↓ Traduction pour B');
  expect('B hold label (FR)', await read('#convHoldB .conv-hold-lbl'), 'Maintenir pour parler');
  expect('B clear button (FR)', await read('#convClearB .conv-clear-lbl'), 'Effacer');
  expect('A stays Turkish', await read('#convHoldA .conv-hold-lbl'), 'Konuşmak için basılı tutun');

  await browser.close();

  var failed = checks.filter(function(c) { return !c.ok; });
  checks.forEach(function(c) {
    console.log((c.ok ? '  ✓ ' : '  ✗ ') + c.name +
      (c.ok ? '' : ('  → erwartet ' + JSON.stringify(c.expected) + ', erhalten ' + JSON.stringify(c.actual))));
  });
  if (pageErrors.length) {
    console.log('\nJavaScript-Fehler auf der Seite:');
    pageErrors.forEach(function(m) { console.log('  ! ' + m); });
  }
  console.log('\n' + (failed.length ? (failed.length + ' von ' + checks.length + ' Checks fehlgeschlagen') : ('Alle ' + checks.length + ' Checks bestanden')));
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch(function(e) { console.error('TEST-ABBRUCH:', e); process.exit(1); });
