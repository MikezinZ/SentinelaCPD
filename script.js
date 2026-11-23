'use strict';
// O gráfico histórico é SVG estático: apresentação e menu não dependem de CDN.
document.addEventListener('DOMContentLoaded', () => {
  const sections = [...document.querySelectorAll('main section[id]')];
  const links = [...document.querySelectorAll('.nav-link')];
  const navbar = document.querySelector('.navbar');
  let queued = false;
  const updateNavigation = () => {
    const top = (navbar ? navbar.getBoundingClientRect().height : 0) + 30;
    let current = sections[0] ? sections[0].id : '';
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= top) current = section.id;
    }
    for (const link of links) {
      const active = link.getAttribute('href') === '#' + current;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    queued = false;
  };
  window.addEventListener('scroll', () => {
    if (!queued) { queued = true; window.requestAnimationFrame(updateNavigation); }
  }, { passive: true });
  window.addEventListener('resize', updateNavigation);
  updateNavigation();
});
