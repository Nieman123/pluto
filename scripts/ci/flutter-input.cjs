const assert = require('node:assert/strict');

// Flutter attaches its text-editing connection after a focus frame. Allow that
// frame before editing, and the controller update before clicking another field.
module.exports = async function fillFlutterInput(page, name, value, exact = true) {
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole('textbox', { name, exact }).click();
  await frame();
  const input = page.locator('input:focus, textarea:focus');
  await input.fill(value);
  await frame();
  assert.equal(await input.inputValue(), value);
};
