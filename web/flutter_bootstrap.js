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
    const appRunner = await engineInitializer.initializeEngine({
      hostElement: document.querySelector("#flutter-app"),
    });
    await appRunner.runApp();

    // Embedded Flutter views do not consistently emit flutter-first-frame.
    // Wait for the browser to paint the running app before removing the shell.
    requestAnimationFrame(() => {
      requestAnimationFrame(removeSplashOnFirstFrame);
    });
  },
});
