export default function LandingPage() {
  // The designer-authored landing page is served as a static file at
  // /public/landing.html and rendered here in a full-viewport iframe, so the
  // browser runs its HTML/CSS/JS exactly as built. Its Sign in / Create
  // account links use <base target="_top"> to navigate the whole window into
  // the real app auth routes.
  return (
    <iframe
      src="/landing.html"
      title="MediFlow"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
      }}
    />
  );
}
