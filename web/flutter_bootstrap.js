{{flutter_js}}
{{flutter_build_config}}

const removeSplashOnFirstFrame = () => {
  window.removeEventListener("flutter-first-frame", removeSplashOnFirstFrame);
  window.removeSplashFromWeb?.();
};

window.addEventListener("flutter-first-frame", removeSplashOnFirstFrame, {
  once: true,
});

async function startPluto() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/app/ticket-shell-sw.js', { scope: '/app/', updateViaCache: 'none' });
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Offline preparation timed out.')), 15000))]);
      if (!navigator.serviceWorker.controller?.scriptURL.endsWith('/ticket-shell-sw.js')) await new Promise(resolve => {
        const done = () => { navigator.serviceWorker.removeEventListener('controllerchange', done); resolve(); };
        navigator.serviceWorker.addEventListener('controllerchange', done); setTimeout(done, 15000);
      });
    } catch (error) { console.warn('Offline app preparation could not complete.', error); }
  }
_flutter.loader.load({
  onEntrypointLoaded: async (engineInitializer) => {
    // Pluto owns the browser viewport. Let Flutter use full-page mode so its
    // text-editing DOM stays anchored to the viewport when a field is focused.
    const appRunner = await engineInitializer.initializeEngine();
    await appRunner.runApp();

    // Wait for the browser to paint the running app before removing the shell.
    requestAnimationFrame(() => {
      requestAnimationFrame(removeSplashOnFirstFrame);
    });
  },
});
}
startPluto();
