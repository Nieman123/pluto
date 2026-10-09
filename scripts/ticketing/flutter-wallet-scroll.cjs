// Flutter slivers intentionally omit offscreen ticket semantics. Reach the
// ticket with real scrolling before asserting its QR or admission status.
async function revealText(page, text) {
  // Sliver ticket semantics group adjacent text into one card announcement.
  // Ignore collapsed text leaves: the painted card's accessible group can be
  // visible even when an earlier duplicate text node has no layout box.
  const target = typeof text === 'string'
    ? page.getByText(text, { exact: false }).or(page.getByLabel(text, { exact: false })).filter({ visible: true }).first()
    : text.filter({ visible: true }).first();
  await page.mouse.move(190, 500);
  for (let step = 0; step < 200; step++) {
    if (await target.isVisible()) return target;
    // Data can arrive after the initial scroll while Firebase initializes.
    await page.mouse.wheel(0, step > 0 && step % 40 === 0 ? -10000 : 180);
    await page.waitForTimeout(200);
  }
  await target.waitFor({ timeout: 1000 });
  return target;
}
async function walletTop(page) {
  await page.mouse.move(190, 500);
  await page.mouse.wheel(0, -10000);
  await page.waitForTimeout(200);
}
module.exports = { revealText, walletTop };
