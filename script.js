const translations = {
  en: {
    navServices: "Services", navReviews: "Reviews", navContact: "Contact", callWired: "Call AutoWired",
    eyebrow: "", heroTitle: "Interior upgrades, <em>done right.</em>",
    heroText: "Dashcams, retrofits and ambient lighting, installed cleanly.",
    heroCta: "Book an install", heroLink: "See services", heroMeta: "Taking bookings in Iasi", heroMetaTwo: "Clean work. Properly fitted.", heroBadge: "Upgrade<br />your interior",
    trustOne: "Built for your car", trustTwo: "Invisible wiring", trustThree: "OEM-style finish", trustFour: "FLRY automotive cable",
    servicesEyebrow: "What we do", servicesTitle: "Made for<br /><em>your car.</em>",
    dashcamKicker: "See everything", dashcamTitle: "Dashcams", dashcamText: "Front, rear and parking dashcams installed in Iasi with hidden wiring, clean positioning and reliable everyday protection.", askAboutCar: "Ask about your car",
    retrofitKicker: "Keep it original", retrofitTitle: "Retrofits", retrofitText: "Automotive retrofits in Iasi with screens, cameras, controls and comfort features integrated for a factory-style finish.", talkUpgrade: "Talk through an upgrade",
    ambientKicker: "Set the mood", ambientTitle: "Ambient light", ambientText: "Custom ambient lighting for car interiors in Iasi, installed cleanly to create a subtle or personalized cabin atmosphere.", designSetup: "Design your setup",
    cableTitle: "Automotive-grade wiring", cableText: "FLRY automotive cables, selected to respect automotive specifications.", ambientShowcaseEyebrow: "Ambient lighting", dashcamShowcaseEyebrow: "Dashcam install", whatsappTitle: "Message us on WhatsApp", whatsappText: "Get a quick answer about your car", whatsappFloat: "WhatsApp",
    contactEyebrow: "Contact", contactTitle: "Tell us about<br /><em>your car.</em>", contactText: "Tell us what you drive and what you want to change.", appointment: "By appointment",
    reviewsWriteButton: "Leave a review"
  },
  ro: {
    navServices: "Servicii", navReviews: "Recenzii", navContact: "Contact", callWired: "Sună la AutoWired",
    eyebrow: "", heroTitle: "Upgrade-uri auto, <em>făcute corect.</em>",
    heroText: "Camere de bord, retrofituri și lumini ambientale, instalate curat.",
    heroCta: "Programează o instalare", heroLink: "Vezi serviciile", heroMeta: "Facem programări în Iași", heroMetaTwo: "Lucru curat. Montaj corect.", heroBadge: "Upgrade<br />pentru interior",
    trustOne: "Creat pentru mașina ta", trustTwo: "Cabluri ascunse", trustThree: "Finisaj OEM", trustFour: "Cablu auto FLRY",
    servicesEyebrow: "Ce facem", servicesTitle: "Făcut pentru<br /><em>mașina ta.</em>",
    dashcamKicker: "Vezi tot", dashcamTitle: "Camere de bord", dashcamText: "Camere de bord auto pentru filmare față, spate și parcare, instalate în Iași cu cabluri ascunse și poziționare discretă.", askAboutCar: "Întreabă pentru mașina ta",
    retrofitKicker: "Păstrează stilul original", retrofitTitle: "Retrofituri", retrofitText: "Retrofituri auto în Iași cu ecrane, camere, comenzi și funcții de confort, integrate curat pentru un aspect cât mai apropiat de fabrică.", talkUpgrade: "Discută un upgrade",
    ambientKicker: "Creează atmosfera", ambientTitle: "Lumini ambientale", ambientText: "Lumini ambientale pentru interiorul mașinii, configurate și montate în Iași pentru o atmosferă discretă sau personalizată în habitaclu.", designSetup: "Alege configurația",
    cableTitle: "Cabluri pentru domeniul auto", cableText: "Cabluri auto FLRY, alese pentru a respecta specificațiile auto.", ambientShowcaseEyebrow: "Lumini ambientale", dashcamShowcaseEyebrow: "Instalare cameră de bord", whatsappTitle: "Scrie-ne pe WhatsApp", whatsappText: "Răspundem rapid despre mașina ta", whatsappFloat: "WhatsApp",
    contactEyebrow: "Contact", contactTitle: "Spune-ne despre<br /><em>mașina ta.</em>", contactText: "Spune-ne ce mașină ai și ce vrei să schimbi.", appointment: "Cu programare",
    reviewsWriteButton: "Lasă o recenzie"
  }
};

const setLanguage = (language) => {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n], [data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18n || element.dataset.i18nPlaceholder;
    const value = translations[language][key];
    if (value) {
      if (element.dataset.i18nPlaceholder) element.placeholder = value;
      else element.innerHTML = value;
    }
  });
  document.querySelectorAll(".language-button").forEach((button) => {
    const active = button.dataset.language === language;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  localStorage.setItem("wired-language", language);
};

document.querySelectorAll(".language-button").forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.language));
});

const menuToggle = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
if (menuToggle && mobileNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    mobileNav.classList.toggle("is-open", !isOpen);
  });
  mobileNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    menuToggle.setAttribute("aria-expanded", "false");
    mobileNav.classList.remove("is-open");
  }));
}

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();
setLanguage(localStorage.getItem("wired-language") || "ro");

const photoButtons = [...document.querySelectorAll(".ambient-photo, .project-photo")];
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const zoomLevel = document.querySelector("#zoom-level");
const lightboxCounter = document.querySelector("#lightbox-counter");
const openOriginal = document.querySelector("#open-original");
let activePhoto = 0;
let zoom = 1;

const updateLightbox = () => {
  const photo = photoButtons[activePhoto]?.querySelector("img");
  if (!photo || !lightboxImage) return;
  lightboxImage.src = photo.currentSrc || photo.src;
  lightboxImage.alt = photo.alt;
  lightboxImage.style.width = `${zoom * 100}%`;
  lightboxImage.style.height = "auto";
  if (zoomLevel) zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
  if (lightboxCounter) lightboxCounter.textContent = `${activePhoto + 1} / ${photoButtons.length}`;
  if (openOriginal) openOriginal.href = photo.src;
};

const setZoom = (value) => {
  zoom = Math.min(3, Math.max(1, value));
  updateLightbox();
};

const openLightbox = (index) => {
  activePhoto = index;
  zoom = 1;
  updateLightbox();
  if (typeof lightbox.showModal === "function") lightbox.showModal();
  else lightbox.setAttribute("open", "");
  lightbox.querySelector(".lightbox-close")?.focus();
};

const closeLightbox = () => {
  if (lightbox.open) lightbox.close();
};

photoButtons.forEach((button, index) => button.addEventListener("click", () => openLightbox(index)));
document.querySelector(".lightbox-close")?.addEventListener("click", closeLightbox);
document.querySelector(".lightbox-prev")?.addEventListener("click", () => {
  activePhoto = (activePhoto + photoButtons.length - 1) % photoButtons.length;
  zoom = 1;
  updateLightbox();
});
document.querySelector(".lightbox-next")?.addEventListener("click", () => {
  activePhoto = (activePhoto + 1) % photoButtons.length;
  zoom = 1;
  updateLightbox();
});
document.querySelector("#zoom-out")?.addEventListener("click", () => setZoom(zoom - 0.25));
document.querySelector("#zoom-in")?.addEventListener("click", () => setZoom(zoom + 0.25));
document.querySelector(".lightbox-stage")?.addEventListener("wheel", (event) => {
  setZoom(zoom + (event.deltaY < 0 ? 0.15 : -0.15));
});
lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});
document.addEventListener("keydown", (event) => {
  if (!lightbox?.open) return;
  if (event.key === "Escape") closeLightbox();
  if (event.key === "ArrowLeft") document.querySelector(".lightbox-prev")?.click();
  if (event.key === "ArrowRight") document.querySelector(".lightbox-next")?.click();
  if (event.key === "+" || event.key === "=") setZoom(zoom + 0.25);
  if (event.key === "-") setZoom(zoom - 0.25);
});
