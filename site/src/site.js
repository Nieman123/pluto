import { initWaiver, initStaff } from './waiver.js';
import { initCalendarPicker } from './calendar.js';
import { initAppLinks } from './app-links.mjs';
initAppLinks();
initCalendarPicker();
initWaiver();
initStaff();

const menuButton = document.querySelector("[data-menu-button]");
const mobileMenu = document.querySelector("[data-mobile-menu]");

function closeMenu({ restoreFocus = false } = {}) {
  if (!mobileMenu || !menuButton) return;
  mobileMenu.hidden = true;
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Open menu");
  if (restoreFocus) menuButton.focus();
}

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Open menu" : "Close menu");
  mobileMenu.hidden = isOpen;
});

document.addEventListener("click", (event) => {
  if (!mobileMenu || mobileMenu.hidden || !menuButton) return;
  if (mobileMenu.contains(event.target) || menuButton.contains(event.target)) return;
  closeMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !mobileMenu || mobileMenu.hidden) return;
  closeMenu({ restoreFocus: true });
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
  if (status) {
    status.textContent = `${currentSlide + 1} / ${slides.length}`;
    status.setAttribute("aria-label", `Photo ${currentSlide + 1} of ${slides.length}`);
  }
}

function startGallery() {
  window.clearInterval(galleryTimer);
  if (slides.length < 2 || document.querySelector("[data-gallery-manual]") || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  galleryTimer = window.setInterval(() => showSlide(currentSlide + 1), 10000);
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

function showAdminState(isAdmin) {
  document.querySelectorAll('[data-auth-admin]').forEach(element => {
    element.hidden = !isAdmin;
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
  if (firebaseConfig.authEmulatorUrl && ['localhost', '127.0.0.1'].includes(location.hostname)) {
    authModule.connectAuthEmulator(auth, firebaseConfig.authEmulatorUrl, { disableWarnings: true });
  }
  let profileStore, stopAdminWatch, authRevision = 0;

  onAuthStateChanged(auth, async (user) => {
    const revision = ++authRevision;
    stopAdminWatch?.(); stopAdminWatch = undefined;
    showAdminState(false);
    showAuthState(Boolean(user));
    window.dispatchEvent(new CustomEvent("pluto-auth", { detail: user }));
    if (!user) return;

    const currentAccount = () => revision === authRevision && auth.currentUser?.uid === user.uid;
    let adminLookup = 0, adminAuthDenied = false;
    async function confirmAdmin() {
      const lookup = ++adminLookup;
      try {
        const token = await user.getIdToken();
        if (!currentAccount() || lookup !== adminLookup) return;
        const response = await fetch('/tickets/api/account/navigation', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: '{}', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
        });
        if (currentAccount() && [401, 403].includes(response.status)) {
          adminAuthDenied = true;
          ++adminLookup;
          stopAdminWatch?.(); stopAdminWatch = undefined;
          showAdminState(false);
          return;
        }
        if (!response.ok) throw new Error(`Admin navigation check failed (${response.status}).`);
        const { admin } = await response.json();
        if (currentAccount() && !adminAuthDenied && lookup === adminLookup) showAdminState(admin === true);
      } catch (error) {
        if (currentAccount() && lookup === adminLookup) {
          showAdminState(false);
          console.warn('Admin navigation check unavailable', error);
        }
      }
    }
    // Same-origin role lookup works even when the Firestore browser connection is blocked.
    void confirmAdmin();

    let avatarUrl = user.photoURL || "/assets/images/pluto-logo.webp";
    let displayName = user.displayName || "";
    try {
      const { doc, getDoc, getFirestore, connectFirestoreEmulator, onSnapshot } = await import(
        "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js"
      );
      if (revision !== authRevision) return;
      if (!profileStore) {
        profileStore = getFirestore(firebaseApp);
        if (firebaseConfig.firestoreEmulator && ['localhost', '127.0.0.1'].includes(location.hostname)) {
          connectFirestoreEmulator(profileStore, firebaseConfig.firestoreEmulator.host, firebaseConfig.firestoreEmulator.port);
        }
      }
      stopAdminWatch = onSnapshot(doc(profileStore, 'adminUsers', user.uid), snapshot => {
        if (currentAccount() && !adminAuthDenied && !snapshot.metadata.fromCache) {
          ++adminLookup; // A newer server snapshot supersedes an in-flight lookup.
          showAdminState(snapshot.exists());
        }
      }, error => {
        if (currentAccount() && !adminAuthDenied) {
          console.warn('Admin navigation unavailable', error);
          void confirmAdmin();
        }
      });
      if (document.querySelector('[data-waiver-page], [data-waiver-staff]')) return;
      const snapshot = await getDoc(doc(profileStore, "userProfiles", user.uid));
      if (typeof snapshot.data()?.displayName === "string" && snapshot.data().displayName.trim()) {
        displayName = snapshot.data().displayName.trim();
      }
      const profileImage = snapshot.data()?.profileImageDataUrl;
      if (typeof profileImage === "string" && profileImage.startsWith("data:image/")) {
        avatarUrl = profileImage;
      }
    } catch (error) {
      console.warn("Account enhancement unavailable", error);
    }
    if (revision !== authRevision || auth.currentUser?.uid !== user.uid) return;
    window.dispatchEvent(new CustomEvent("pluto-profile", { detail: { uid: user.uid, displayName } }));
    document.querySelectorAll("[data-auth-avatar]").forEach((image) => {
      image.src = avatarUrl;
    });
  });
}

function scheduleAuthEnhancement() {
  const run = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(
        () => enhanceAuth().catch((error) => (console.warn("Auth enhancement unavailable", error), window.dispatchEvent(new Event("pluto-auth-error")))),
        { timeout: 4000 },
      );
      return;
    }
    window.setTimeout(
      () => enhanceAuth().catch((error) => (console.warn("Auth enhancement unavailable", error), window.dispatchEvent(new Event("pluto-auth-error")))),
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

// Native dialog keeps focus inside the viewer; links still work without JS.
const photoLinks = [...document.querySelectorAll('[data-archive-photo]')];
const photoDialog = document.querySelector('[data-photo-dialog]');
const photoImage = document.querySelector('[data-photo-image]');
const photoStatus = document.querySelector('[data-photo-status]');
let photoIndex = 0;
function showPhoto(index) {
  photoIndex = (index + photoLinks.length) % photoLinks.length;
  const link = photoLinks[photoIndex];
  photoImage.src = link.href;
  photoImage.alt = link.dataset.photoAlt;
  photoStatus.textContent = `Photo ${photoIndex + 1} of ${photoLinks.length}`;
}
photoLinks.forEach((link, index) => link.addEventListener('click', (event) => {
  if (!photoDialog?.showModal || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  showPhoto(index);
  photoDialog.showModal();
}));
document.querySelector('[data-photo-close]')?.addEventListener('click', () => photoDialog.close());
document.querySelector('[data-photo-previous]')?.addEventListener('click', () => showPhoto(photoIndex - 1));
document.querySelector('[data-photo-next]')?.addEventListener('click', () => showPhoto(photoIndex + 1));
photoDialog?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    showPhoto(photoIndex + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
photoDialog?.addEventListener('click', (event) => {
  if (event.target !== photoDialog) return;
  const bounds = photoDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) photoDialog.close();
});
