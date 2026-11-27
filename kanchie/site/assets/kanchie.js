// Phone menu toggle and the inert contact form (no backend yet).
(() => {
  const btn = document.querySelector('.menu');
  const nav = document.getElementById('mnav');
  if (btn && nav) {
    const set = (open) => { nav.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', () => set(!nav.classList.contains('open')));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.hd')) set(false); });
  }
  const form = document.getElementById('contact-form');
  if (form) form.addEventListener('submit', (e) => e.preventDefault());
})();
