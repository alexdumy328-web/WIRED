# Wired

One-page marketing site for AutoWired, an automotive interior upgrade business in Iasi, Romania.

## Run locally

Open `index.html` directly in a browser, or serve the folder with any static file server:

```powershell
python -m http.server 4173
```

Then visit `http://127.0.0.1:4173`.

## Replace the photos

The landing hero uses `assets/hero-ambient-lights.jpg`. The ambient-light showcase uses the supplied photos in `assets/ambient-lights-1.jpeg`, `assets/ambient-lights-2.jpeg`, and `assets/ambient-lights-3.jpeg`. The dashcam showcase uses `assets/dashcam-install.jpeg`. Replace those files with newer workshop photos when needed.

The current AutoWired wordmark is `assets/autowired-logo.svg`.

## Contact form

The contact form is static and Cloudflare Pages-compatible. It sends submissions through FormSubmit to `meleniagroup@gmail.com`, without requiring a backend or paid hosting. The first submission may require confirming the receiving email address with FormSubmit.
