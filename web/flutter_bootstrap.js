{{flutter_js}}
{{flutter_build_config}}

const removeSplashOnFirstFrame = () => {
  window.removeEventListener("flutter-first-frame", removeSplashOnFirstFrame);
  window.removeSplashFromWeb?.();
};

window.addEventListener("flutter-first-frame", removeSplashOnFirstFrame, {
  once: true,
});

_flutter.loader.load({
  serviceWorkerSettings: {
    serviceWorkerVersion: {{flutter_service_worker_version}},
  },
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
