// Runtime config for the API base URL. There is no build step in this
// vanilla-JS app, so this file (rather than a baked-in env var) is how the
// frontend knows where the backend lives.
//
// This committed default is for local development. When deploying to
// GitHub Pages, .github/workflows/deploy-pages.yml overwrites this file
// with the deployed API's URL (from the API_URL repository variable)
// before publishing, so this exact default never ships to production.
window.APP_CONFIG = {
  apiBaseUrl: 'http://localhost:4000/api',
};
