const assert = require('node:assert/strict');

// Focus the labeled semantics input as assistive technology would. A pointer
// click can auto-scroll the browser's overlay without scrolling Flutter's canvas
// and hit an unrelated widget on small screens. Flutter forwards this focus
// event to the actual field; allow its editing connection and controller frames.
module.exports = async function fillFlutterInput(page, name, value, exact = true) {
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const control = await page.getByRole('textbox', { name, exact }).elementHandle();
  await control.evaluate(el => el.focus({ preventScroll: true }));
  await frame();
  // Focusing can change the input's accessible label/type, so retain the
  // original element instead of looking it up by its previous role again.
  assert.ok(await control.evaluate(el => el === document.activeElement), 'the requested Flutter field must have focus');
  const input = page.locator('input:focus, textarea:focus');
  await input.fill(value);
  await frame();
  assert.equal(await input.inputValue(), value);
};
