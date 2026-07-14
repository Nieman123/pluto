const menuButton = document.querySelector("[data-menu-button]");
const mobileMenu = document.querySelector("[data-mobile-menu]");

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Open menu" : "Close menu");
  mobileMenu.hidden = isOpen;
});

document.addEventListener("click", (event) => {
  if (!mobileMenu || mobileMenu.hidden || !menuButton) return;
  if (mobileMenu.contains(event.target) || menuButton.contains(event.target)) return;
  mobileMenu.hidden = true;
  menuButton.setAttribute("aria-expanded", "false");
});

const slides = [...document.querySelectorAll("[data-gallery-slide]")];
const status = document.querySelector("[data-gallery-status]");
let currentSlide = 0;
let galleryTimer;

function showSlide(nextIndex) {
  if (!slides.length) return;
  slides[currentSlide].hidden = true;
  slides[currentSlide].classList.remove("is-entering");
  currentSlide = (nextIndex + slides.length) % slides.length;
  slides[currentSlide].hidden = false;
  slides[currentSlide].classList.add("is-entering");
  if (status) status.textContent = `${currentSlide + 1} / ${slides.length}`;
}

function startGallery() {
  window.clearInterval(galleryTimer);
  if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  galleryTimer = window.setInterval(() => showSlide(currentSlide + 1), 5000);
}

document.querySelector("[data-gallery-previous]")?.addEventListener("click", () => {
  showSlide(currentSlide - 1);
  startGallery();
});
document.querySelector("[data-gallery-next]")?.addEventListener("click", () => {
  showSlide(currentSlide + 1);
  startGallery();
});
startGallery();

const deferredEventImages = [...document.querySelectorAll("[data-deferred-src]")];

function loadDeferredEventImage(image) {
  const source = image.dataset.deferredSrc;
  if (!source) return;
  image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
  image.addEventListener("error", () => {
    image.src = "/assets/images/pluto-logo.webp";
  }, { once: true });
  image.src = source;
  delete image.dataset.deferredSrc;
}

if (deferredEventImages.length && "IntersectionObserver" in window) {
  const eventImageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      loadDeferredEventImage(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px 32px 0px" });
  deferredEventImages.forEach((image) => eventImageObserver.observe(image));
} else if (deferredEventImages.length) {
  window.addEventListener("load", () => {
    deferredEventImages.forEach(loadDeferredEventImage);
  }, { once: true });
}

function showAuthState(isSignedIn) {
  document.querySelectorAll("[data-auth-signed-in]").forEach((element) => {
    element.hidden = !isSignedIn;
  });
  document.querySelectorAll("[data-auth-signed-out]").forEach((element) => {
    element.hidden = isSignedIn;
  });
}

async function enhanceAuth() {
  const configElement = document.querySelector("#firebase-config");
  if (!configElement?.textContent) return;

  const [appModule, authModule] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js"),
  ]);
  const firebaseConfig = JSON.parse(configElement.textContent);
  const { initializeApp } = appModule;
  const { getAuth, onAuthStateChanged } = authModule;
  const firebaseApp = initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);

  onAuthStateChanged(auth, async (user) => {
    showAuthState(Boolean(user));
    if (!user) return;

    let avatarUrl = user.photoURL || "/assets/images/pluto-logo.webp";
    try {
      const { doc, getDoc, getFirestore } = await import(
        "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js"
      );
      const firestore = getFirestore(firebaseApp);
      const snapshot = await getDoc(doc(firestore, "userProfiles", user.uid));
      const profileImage = snapshot.data()?.profileImageDataUrl;
      if (typeof profileImage === "string" && profileImage.startsWith("data:image/")) {
        avatarUrl = profileImage;
      }
    } catch (error) {
      console.warn("Profile enhancement unavailable", error);
    }
    document.querySelectorAll("[data-auth-avatar]").forEach((image) => {
      image.src = avatarUrl;
    });
  });
}

function scheduleAuthEnhancement() {
  const run = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(
        () => enhanceAuth().catch((error) => console.warn("Auth enhancement unavailable", error)),
        { timeout: 4000 },
      );
      return;
    }
    window.setTimeout(
      () => enhanceAuth().catch((error) => console.warn("Auth enhancement unavailable", error)),
      1000,
    );
  };

  if (document.readyState === "complete") {
    run();
  } else {
    window.addEventListener("load", run, { once: true });
  }
}

scheduleAuthEnhancement();
