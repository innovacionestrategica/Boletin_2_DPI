/* =========================================================================
   Boletín DPI · CFIA — script.js
   Vanilla JS, sin dependencias. El contenido vive en contenido.js.
   Funciones: render de portada/áreas/artículos, menú móvil, scroll suave
   con indicador de sección activa, animaciones de entrada, progreso de
   lectura, visor de fotografías y navegación entre artículos.
   ========================================================================= */
(() => {
  'use strict';
  const data = window.BOLETIN;
  if (!data) return;

  /* -----------------------------------------------------------------------
     Utilidades
     ----------------------------------------------------------------------- */
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pad = n => String(n).padStart(2, '0');

  const areasById = new Map(data.areas.map(a => [a.id, a]));
  const articlesById = new Map(data.articles.map(a => [a.id, a]));
  const activeAreas = data.areas.filter(area => data.articles.some(a => a.area === area.id));
  const articlesOf = areaId => data.articles.filter(a => a.area === areaId);
  // Orden de lectura: por área (según el índice) y luego por aparición.
  const readingOrder = activeAreas.flatMap(area => articlesOf(area.id));

  const landing = $('#landing');
  const reader = $('#reader');
  const header = $('#site-header');
  let readerActive = false;
  let returnContext = null;

  // Los textos editoriales se insertan como texto, nunca como HTML ejecutable.
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function isExternal(href) {
    try { return new URL(href, document.baseURI).origin !== location.origin; } catch { return false; }
  }
  function link(text, href, className) {
    const a = el('a', className, text);
    a.href = href;
    if (isExternal(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }
  function safeURL(value) {
    try {
      const url = new URL(value, document.baseURI);
      return ['https:', 'http:', 'file:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }
  function picture(src, alt, className) {
    const image = el('img', className);
    const url = safeURL(src);
    if (url) image.src = url;
    image.alt = alt || '';
    image.loading = 'lazy';
    image.decoding = 'async';
    return image;
  }
  function arrow(symbol = '↗', className = 'arrow-circle') {
    const s = el('span', className, symbol);
    s.setAttribute('aria-hidden', 'true');
    return s;
  }
  function readTime(article) {
    const words = article.blocks
      .map(b => [b.text || '', ...(b.items || []).map(i => `${i.label || ''} ${i.text}`)].join(' '))
      .join(' ').trim().split(/\s+/).length;
    return `${Math.max(1, Math.ceil(words / 200))} min de lectura`;
  }
  function scrollInstant(top) { window.scrollTo({ top, behavior: 'instant' }); }

  /* -----------------------------------------------------------------------
     Animaciones de entrada (IntersectionObserver)
     ----------------------------------------------------------------------- */
  const revealObserver = ('IntersectionObserver' in window && !reduceMotion.matches)
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: .08 })
    : null;
  function reveal(node, delay = 0) {
    node.classList.add('reveal');
    node.style.setProperty('--d', String(delay));
    if (revealObserver) revealObserver.observe(node);
    else node.classList.add('is-visible');
    return node;
  }
  function observeStaticReveals() {
    $$('.reveal').forEach(node => {
      if (revealObserver) revealObserver.observe(node);
      else node.classList.add('is-visible');
    });
  }

  /* -----------------------------------------------------------------------
     Tarjetas
     ----------------------------------------------------------------------- */
  function card(article, { key, variant = '', delay = 0 } = {}) {
    const area = areasById.get(article.area);
    const hasImage = Boolean(article.image);
    const node = el('article', `card ${variant}${hasImage ? '' : ' card-typographic'}`.trim());

    if (hasImage) {
      const media = el('div', `card-media${article.imageFit === 'contain' ? ' is-contain' : ''}`);
      media.append(picture(article.image, article.imageAlt));
      node.append(media);
    }

    const body = el('div', 'card-body');
    body.append(el('p', 'tag', area?.name || ''));

    const title = el('h3', 'card-title');
    const a = link(article.title, `#articulo/${article.id}`, 'stretched');
    a.dataset.focusKey = key;
    title.append(a);
    body.append(title, el('p', 'card-summary', article.summary));

    const footer = el('div', 'card-footer');
    const meta = el('p', 'card-meta');
    meta.append(el('strong', '', article.author), document.createTextNode(`${article.date} · ${readTime(article)}`));
    footer.append(meta, arrow());
    body.append(footer);
    node.append(body);
    return reveal(node, delay);
  }

  /* -----------------------------------------------------------------------
     Portada, destacados, índice y áreas
     ----------------------------------------------------------------------- */
  function populateEdition() {
    $$('[data-edition]').forEach(n => n.textContent = data.edition);
    $$('[data-period]').forEach(n => n.textContent = data.period);
    $$('[data-year]').forEach(n => n.textContent = data.year);

    // Tarjeta de portada
    const lead = articlesById.get(data.featured?.[0]) || data.articles[0];
    if (lead) {
      const img = $('.hero-card-media img');
      img.src = data.coverImage?.src || lead.image;
      img.alt = data.coverImage?.alt || lead.imageAlt;
      $('#hero-tag').textContent = areasById.get(lead.area)?.name || '';
      $('#hero-card-title').textContent = lead.title;
      const read = $('#hero-card-link');
      read.href = `#articulo/${lead.id}`;
      read.setAttribute('aria-label', `Leer artículo: ${lead.title}`);
    }

    // Índice de áreas (tiles), sub-navegación, menú móvil y pie
    const chips = $('#area-nav');
    const footerList = $('#footer-area-list');
    const sections = $('#area-sections');

    activeAreas.forEach((area, i) => {
      const articles = articlesOf(area.id);
      const num = pad(i + 1);
      const countText = `${articles.length} ${articles.length === 1 ? 'artículo' : 'artículos'}`;

      // Chip
      const chip = link('', `#area-${area.id}`, 'chip');
      chip.append(el('span', 'chip-num', num), document.createTextNode(area.name));
      chips.append(chip);

      // Pie
      const fli = el('li');
      fli.append(link(area.name, `#area-${area.id}`));
      footerList.append(fli);

      // Sección
      const section = el('section', 'area-section');
      section.id = `area-${area.id}`;
      section.setAttribute('aria-labelledby', `title-${area.id}`);
      const heading = el('header', 'area-heading');
      const main = el('div', 'area-heading-main');
      const numEl = el('span', 'area-number', num);
      numEl.setAttribute('aria-hidden', 'true');
      const text = el('div');
      const h2 = el('h2', '', area.name);
      h2.id = `title-${area.id}`;
      text.append(h2, el('p', '', area.description));
      main.append(numEl, text);
      heading.append(main, el('span', 'area-total', countText));
      reveal(heading);

      const grid = el('div', `cards-grid ${articles.length === 1 ? 'count-1' : articles.length === 2 ? 'count-2' : articles.length === 3 ? 'count-3' : 'count-many'}`);
      articles.forEach((article, j) => {
        grid.append(card(article, { key: `area-${article.id}`, variant: articles.length === 1 ? 'card-wide' : '', delay: j }));
      });
      section.append(heading, grid);
      sections.append(section);
    });

    // Agenda (opcional)
    if (Array.isArray(data.agenda) && data.agenda.length) {
      $('#agenda').hidden = false;
      data.agenda.forEach((item, i) => {
        const node = el('article', 'card');
        const body = el('div', 'card-body');
        body.append(el('p', 'tag', item.date), el('h3', 'card-title', item.title), el('p', 'card-summary', item.description));
        const url = safeURL(item.url);
        if (url) body.append(link('Consultar detalles ↗', url, 'text-link'));
        node.append(body);
        $('#agenda-items').append(reveal(node, i));
      });
    }
  }

  /* -----------------------------------------------------------------------
     Scroll: encabezado compacto, volver arriba, progreso y sección activa
     ----------------------------------------------------------------------- */
  const toTop = $('#to-top');
  const progress = $('#read-progress-bar');
  const navLinks = [];
  let ticking = false;

  function setCurrent(links, id, attr) {
    links.forEach(a => {
      if (a.hash === `#${id}`) a.setAttribute('aria-current', attr);
      else a.removeAttribute('aria-current');
    });
  }
  function centerChip(chip) {
    const box = $('#area-nav');
    if (!chip || !box || box.scrollWidth <= box.clientWidth) return;
    const left = chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2;
    box.scrollTo({ left, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }
  let lastChip = null;
  function onScroll() {
    ticking = false;
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 8);
    toTop.classList.toggle('is-visible', y > window.innerHeight * 0.9);

    if (readerActive) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      return;
    }

    // Área activa en la barra de chips
    const line = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 70) + window.innerHeight * 0.25;
    let area = null;
    $$('.area-section').forEach(section => {
      if (section.getBoundingClientRect().top <= line) area = section.id;
    });
    const chipsLinks = $$('#area-nav a');
    setCurrent(chipsLinks, area || '', 'location');
    const chip = chipsLinks.find(a => a.hash === `#${area}`);
    if (chip && chip !== lastChip) { centerChip(chip); lastChip = chip; }
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  toTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    $('#contenido').focus({ preventScroll: true });
  });

  // Alturas reales del encabezado y de la barra de áreas → Custom Properties
  function updateHeights() {
    const root = document.documentElement.style;
    root.setProperty('--header-h', `${header.getBoundingClientRect().height}px`);
    root.setProperty('--bar-h', `${$('#area-bar')?.getBoundingClientRect().height || 0}px`);
  }
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(updateHeights);
    ro.observe(header);
    ro.observe($('#area-bar'));
  }
  window.addEventListener('resize', updateHeights);

  /* -----------------------------------------------------------------------
     Visor de fotografías
     ----------------------------------------------------------------------- */
  // Visor tipo "lightbox": fondo oscuro a pantalla completa, imagen protagonista,
  // navegación entre las fotografías del artículo (botones, teclado y gesto táctil).
  const photoDialog = el('dialog', 'lightbox');
  photoDialog.setAttribute('aria-label', 'Visor de fotografías');
  const lbTop = el('div', 'lightbox-top');
  const lbCounter = el('span', 'lightbox-counter');
  lbCounter.setAttribute('aria-live', 'polite');
  const closePhoto = el('button', 'lightbox-btn lightbox-close', '✕');
  closePhoto.type = 'button';
  closePhoto.setAttribute('aria-label', 'Cerrar visor (Esc)');
  lbTop.append(lbCounter, closePhoto);
  const lbStage = el('div', 'lightbox-stage');
  const largePhoto = el('img', 'lightbox-img');
  largePhoto.decoding = 'async';
  const lbSpinner = el('span', 'lightbox-spinner');
  lbSpinner.setAttribute('aria-hidden', 'true');
  lbStage.append(lbSpinner, largePhoto);
  const prevPhoto = el('button', 'lightbox-btn lightbox-nav prev', '‹');
  prevPhoto.type = 'button';
  prevPhoto.setAttribute('aria-label', 'Fotografía anterior');
  const nextPhoto = el('button', 'lightbox-btn lightbox-nav next', '›');
  nextPhoto.type = 'button';
  nextPhoto.setAttribute('aria-label', 'Fotografía siguiente');
  const photoCaption = el('p', 'lightbox-caption');
  photoDialog.append(lbTop, lbStage, prevPhoto, nextPhoto, photoCaption);
  document.body.append(photoDialog);
  let photoOrigin = null;
  let photoSet = [];
  let photoIndex = 0;

  function captionFor(image) {
    return image.closest('figure')?.querySelector('figcaption')?.textContent || '';
  }
  function showPhoto(index) {
    if (!photoSet.length) return;
    photoIndex = (index + photoSet.length) % photoSet.length;
    const image = photoSet[photoIndex];
    photoDialog.classList.add('is-loading');
    largePhoto.onload = () => photoDialog.classList.remove('is-loading');
    largePhoto.src = image.currentSrc || image.src;
    largePhoto.alt = image.alt;
    photoCaption.textContent = captionFor(image);
    photoCaption.hidden = !photoCaption.textContent;
    const many = photoSet.length > 1;
    prevPhoto.hidden = nextPhoto.hidden = !many;
    lbCounter.textContent = many ? `${photoIndex + 1} / ${photoSet.length}` : '';
    if (largePhoto.complete) photoDialog.classList.remove('is-loading');
  }
  function enableImageZoom(image) {
    image.classList.add('zoomable-photo');
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-haspopup', 'dialog');
    image.setAttribute('aria-label', `Ampliar imagen: ${image.alt}`);
    function openPhoto(event) {
      event.preventDefault();
      event.stopPropagation();
      photoOrigin = image;
      photoSet = $$('.zoomable-photo', reader);
      showPhoto(Math.max(0, photoSet.indexOf(image)));
      photoDialog.showModal();
      document.body.classList.add('no-scroll');
      closePhoto.focus();
    }
    image.addEventListener('click', openPhoto);
    image.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openPhoto(e); });
  }
  closePhoto.addEventListener('click', () => photoDialog.close());
  prevPhoto.addEventListener('click', () => showPhoto(photoIndex - 1));
  nextPhoto.addEventListener('click', () => showPhoto(photoIndex + 1));
  // Clic en el fondo (fuera de la imagen y controles) cierra el visor.
  photoDialog.addEventListener('click', e => {
    if (e.target === photoDialog || e.target === lbStage) photoDialog.close();
  });
  photoDialog.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); showPhoto(photoIndex - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showPhoto(photoIndex + 1); }
  });
  let touchX = null;
  photoDialog.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  photoDialog.addEventListener('touchend', e => {
    if (touchX === null || photoSet.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) showPhoto(photoIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  });
  photoDialog.addEventListener('close', () => {
    document.body.classList.remove('no-scroll');
    largePhoto.removeAttribute('src');
    photoOrigin?.focus({ preventScroll: true });
  });

  /* -----------------------------------------------------------------------
     Visor de video a pantalla completa (videos locales)
     ----------------------------------------------------------------------- */
  const videoDialog = el('dialog', 'lightbox video-lightbox');
  videoDialog.setAttribute('aria-label', 'Video a pantalla completa');
  const vTop = el('div', 'lightbox-top');
  const vTitle = el('span', 'lightbox-counter');
  const vClose = el('button', 'lightbox-btn lightbox-close', '✕');
  vClose.type = 'button';
  vClose.setAttribute('aria-label', 'Cerrar video (Esc)');
  vTop.append(vTitle, vClose);
  const vStage = el('div', 'lightbox-stage');
  const bigVideo = el('video', 'lightbox-video');
  bigVideo.controls = true;
  bigVideo.playsInline = true;
  vStage.append(bigVideo);
  videoDialog.append(vTop, vStage);
  document.body.append(videoDialog);
  let videoOrigin = null;
  function openVideo(inline, url, title) {
    videoOrigin = inline;
    const t = inline.currentTime || 0;
    inline.pause();
    vTitle.textContent = title;
    bigVideo.src = url;
    bigVideo.currentTime = t;
    videoDialog.showModal();
    document.body.classList.add('no-scroll');
    bigVideo.play().catch(() => {});
    vClose.focus();
  }
  vClose.addEventListener('click', () => videoDialog.close());
  videoDialog.addEventListener('click', e => { if (e.target === videoDialog || e.target === vStage) videoDialog.close(); });
  videoDialog.addEventListener('close', () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    bigVideo.pause();
    if (videoOrigin) videoOrigin.currentTime = bigVideo.currentTime || 0;
    bigVideo.removeAttribute('src');
    bigVideo.load();
    document.body.classList.remove('no-scroll');
    videoOrigin?.focus({ preventScroll: true });
  });

  /* -----------------------------------------------------------------------
     Lector de artículos
     ----------------------------------------------------------------------- */
  function goBack(article) {
    if (returnContext) history.back();
    else location.hash = article ? `area-${article.area}` : 'areas';
  }
  function backButton(article) {
    const b = el('button', 'button button-outline button-sm', '← Volver a la edición');
    b.type = 'button';
    b.addEventListener('click', () => goBack(article));
    return b;
  }
  function copyLinkButton() {
    const b = el('button', 'button button-ghost button-sm copy-link', 'Copiar enlace');
    b.type = 'button';
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        b.textContent = 'Enlace copiado ✓';
        b.classList.add('is-done');
        setTimeout(() => { b.textContent = 'Copiar enlace'; b.classList.remove('is-done'); }, 2200);
      } catch { b.textContent = 'No se pudo copiar'; }
    });
    return b;
  }

  function renderBlocks(article, content) {
    function addReferences(node, refs) {
      (refs || []).forEach(number => {
        const source = article.sources?.[number - 1]?.links?.[0];
        const url = source && safeURL(source.url);
        if (!url) return;
        const a = link(`[${number}]`, url, 'inline-source');
        a.setAttribute('aria-label', `Fuente ${number}: ${source.text}`);
        node.append(document.createTextNode(' '), a);
      });
    }
    article.blocks.forEach(block => {
      let element;
      switch (block.type) {
        case 'heading':
          element = el('h2', 'article-subheading', block.text); break;
        case 'lead':
          element = el('p', 'article-lead');
          element.append(el('em', '', block.text)); break;
        case 'link': {
          element = el('p');
          const url = safeURL(block.url);
          if (url) element.append(link(`${block.text} ↗`, url, 'article-resource-link'));
          break;
        }
        case 'list':
          element = el(block.ordered ? 'ol' : 'ul', 'article-list');
          block.items.forEach(item => {
            const li = el('li');
            if (item.label) li.append(el('strong', '', `${item.label}: `));
            li.append(document.createTextNode(item.text));
            addReferences(li, item.refs);
            element.append(li);
          });
          break;
        case 'table': {
          element = el('div', 'article-table-wrap');
          element.tabIndex = 0;
          element.setAttribute('role', 'region');
          element.setAttribute('aria-label', block.caption || 'Tabla');
          const table = el('table', 'article-table');
          if (block.caption) table.append(el('caption', '', block.caption));
          const head = el('thead');
          const hr = el('tr');
          block.headers.forEach(t => { const c = el('th', '', t); c.scope = 'col'; hr.append(c); });
          head.append(hr);
          const tbody = el('tbody');
          block.rows.forEach(values => {
            const row = el('tr');
            values.forEach((t, i) => {
              const c = el(i === 0 ? 'th' : 'td', '', t);
              if (i === 0) c.scope = 'row';
              row.append(c);
            });
            tbody.append(row);
          });
          table.append(head, tbody);
          element.append(table);
          break;
        }
        case 'local-video': {
          element = el('section', 'article-local-video');
          element.setAttribute('aria-label', block.title || 'Video del artículo');
          const video = el('video');
          video.controls = true;
          video.playsInline = true;
          video.preload = 'metadata';
          video.setAttribute('aria-label', block.title || 'Video del artículo');
          const url = safeURL(block.src);
          if (url) {
            const source = el('source');
            source.src = url;
            source.type = 'video/mp4';
            video.append(source);
            // Antes: enlace que abría el .mp4 en la misma pestaña, sin forma de volver.
            // Ahora: visor a pantalla completa dentro del sitio, con botón de cerrar y Esc.
            const expand = el('button', 'text-link video-expand', 'Ver en pantalla completa ');
            expand.type = 'button';
            expand.append(arrow('⤢', ''));
            expand.addEventListener('click', () => openVideo(video, url, block.title || 'Video del artículo'));
            element.append(video, expand);
          }
          break;
        }
        case 'video': {
          // Video de YouTube con "fachada": se muestra la miniatura y el reproductor se carga
          // al hacer clic. YouTube exige que la página envíe su origen (Referer); si no lo recibe
          // muestra el "Error 153". Por eso el iframe se crea con origin + referrerPolicy, y si el
          // sitio se abre como archivo local (file://), el video se abre directamente en YouTube.
          element = el('section', 'article-video');
          const id = block.youtubeId || '';
          if (/^[A-Za-z0-9_-]{11}$/.test(id)) {
            const title = block.title || 'Video del artículo';
            const watchURL = `https://www.youtube.com/watch?v=${id}`;
            const canEmbed = /^https?:$/.test(location.protocol);
            const player = el('button', 'yt-facade');
            player.type = 'button';
            player.setAttribute('aria-label', `Reproducir video: ${title}`);
            const thumb = el('img', 'yt-thumb');
            thumb.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
            thumb.alt = '';
            thumb.loading = 'lazy';
            thumb.decoding = 'async';
            thumb.onerror = () => thumb.remove(); // sin conexión: queda el fondo con el botón de reproducir
            const play = el('span', 'yt-play');
            play.setAttribute('aria-hidden', 'true');
            const label = el('span', 'yt-label', title);
            player.append(thumb, play, label);
            player.addEventListener('click', () => {
              if (!canEmbed) { window.open(watchURL, '_blank', 'noopener'); return; }
              const frame = el('iframe');
              const params = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1', modestbranding: '1', origin: location.origin });
              frame.src = `https://www.youtube.com/embed/${id}?${params}`;
              frame.title = title;
              frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
              frame.allowFullscreen = true;
              frame.referrerPolicy = 'strict-origin-when-cross-origin';
              player.replaceWith(frame);
              frame.focus();
            });
            const fallback = el('a', 'text-link', 'Ver el video en YouTube ↗');
            fallback.href = watchURL;
            fallback.target = '_blank';
            fallback.rel = 'noopener';
            element.setAttribute('aria-label', title);
            element.append(player, fallback);
          }
          break;
        }
        case 'image-group': {
          element = el('figure', 'article-photo-group');
          const grid = el('div', 'article-photo-grid');
          block.images.forEach(p => grid.append(picture(p.src, p.alt)));
          element.append(grid, el('figcaption', '', block.caption));
          break;
        }
        case 'image': {
          element = el('figure', 'article-figure');
          element.append(picture(block.src, block.alt));
          const caption = block.caption ?? block.alt;
          if (caption) element.append(el('figcaption', '', caption));
          break;
        }
        default:
          element = el(block.type === 'quote' ? 'blockquote' : 'p', block.type === 'callout' ? 'article-callout' : '', block.text);
      }
      if (block.type === 'paragraph' && block.emphasis && block.text.includes(block.emphasis)) {
        const start = block.text.indexOf(block.emphasis);
        element.replaceChildren(
          document.createTextNode(block.text.slice(0, start)),
          el('strong', '', block.emphasis),
          document.createTextNode(block.text.slice(start + block.emphasis.length))
        );
      }
      if (block.type === 'paragraph') element.classList.add('article-paragraph');
      addReferences(element, block.refs);
      content.append(element);
    });
  }

  function renderArticle(article) {
    reader.replaceChildren();
    reader.classList.remove('view-enter');
    void reader.offsetWidth; // reinicia la animación de entrada
    reader.classList.add('view-enter');

    const top = el('div', 'reader-top');
    const crumbs = el('ol', 'breadcrumb');
    crumbs.setAttribute('aria-label', 'Ruta de navegación');
    const c1 = el('li'); c1.append(link('Inicio', '#inicio'));
    crumbs.append(c1);
    if (article) {
      const c2 = el('li'); c2.append(link(areasById.get(article.area)?.name || 'Área', `#area-${article.area}`));
      crumbs.append(c2);
    }
    top.append(crumbs, backButton(article));
    reader.append(top);

    if (!article) {
      const box = el('div', 'reader-header');
      box.append(el('h1', '', 'Artículo no encontrado'), el('p', 'section-lead', 'Podés volver a la edición para consultar los artículos disponibles.'));
      reader.append(box);
      return;
    }

    const node = el('article');
    const head = el('header', 'reader-header');
    const title = el('h1', '', article.title);
    title.id = 'article-title';
    node.setAttribute('aria-labelledby', title.id);
    if (article.brandImage) head.append(picture(article.brandImage, 'Autodesk Forma', 'article-brand'));
    head.append(el('p', 'tag', areasById.get(article.area)?.name || ''), title);

    const byline = el('div', 'reader-byline');
    const author = el('span', 'author');
    author.append(document.createTextNode(article.author));
    const actions = el('span', 'byline-actions');
    if (navigator.clipboard) actions.append(copyLinkButton());
    byline.append(author, el('span', '', article.date), el('span', '', readTime(article)), actions);
    head.append(byline);
    node.append(head);

    if (article.image && !article.hideCover) {
      const figure = el('figure', 'reader-cover');
      const photo = picture(article.image, article.imageAlt, article.coverFit === 'cover' ? 'reader-hero-fill' : '');
      photo.loading = 'eager';
      figure.append(photo);
      if (article.imageCaption) figure.append(el('figcaption', '', article.imageCaption));
      node.append(figure);
    }

    const content = el('div', 'reader-content');
    renderBlocks(article, content);

    if (article.gallery?.length) {
      const gallery = el('div', 'reader-gallery');
      article.gallery.forEach(p => {
        const fig = el('figure');
        fig.append(picture(p.src, p.alt), el('figcaption', '', p.caption || p.alt));
        gallery.append(fig);
      });
      content.append(gallery);
    }

    if (article.sources?.length) {
      const sources = el('aside', 'reader-sources');
      sources.setAttribute('aria-label', 'Fuentes');
      sources.append(el('h2', '', 'Fuentes'));
      article.sources.forEach(source => {
        sources.append(el('p', '', source.text));
        source.links.forEach(item => {
          const url = safeURL(item.url);
          if (!url) return;
          const p = el('p');
          p.append(link(item.text, url));
          sources.append(p);
        });
      });
      content.append(sources);
    }
    node.append(content);
    reader.append(node);

    // Anterior / siguiente
    const i = readingOrder.findIndex(a => a.id === article.id);
    const prev = readingOrder[i - 1];
    const next = readingOrder[i + 1];
    if (prev || next) {
      const pager = el('nav', 'article-pager');
      pager.setAttribute('aria-label', 'Otros artículos');
      [[prev, 'prev', '← Anterior'], [next, 'next', 'Siguiente →']].forEach(([a, cls, label]) => {
        if (!a) return;
        const p = link('', `#articulo/${a.id}`, `pager-link ${cls}`);
        p.append(el('span', 'eyebrow', label), el('strong', '', a.title), el('small', '', areasById.get(a.area)?.name || ''));
        pager.append(p);
      });
      reader.append(pager);
    }

    // Más de esta área (o destacados si el área tiene un solo artículo)
    let related = articlesOf(article.area).filter(a => a.id !== article.id);
    let relatedTitle = `Más de ${areasById.get(article.area)?.name || 'esta área'}`;
    if (!related.length) {
      related = (data.featured || []).map(id => articlesById.get(id)).filter(a => a && a.id !== article.id);
      relatedTitle = 'Destacados de la edición';
    }
    related = related.slice(0, 3);
    if (related.length) {
      const box = el('section', 'related');
      box.setAttribute('aria-labelledby', 'related-title');
      const h = el('h2', '', relatedTitle);
      h.id = 'related-title';
      const grid = el('div', `cards-grid count-${related.length === 3 ? 3 : 2}`);
      related.forEach((a, j) => grid.append(card(a, { key: `related-${a.id}`, delay: j })));
      box.append(el('p', 'eyebrow eyebrow-red', 'Seguí leyendo'), h, grid);
      reader.append(box);
    }

    $$('img:not(.article-brand)', content).forEach(enableImageZoom);
    $$('.reader-cover img', node).forEach(enableImageZoom);
  }

  /* -----------------------------------------------------------------------
     Enrutador por fragmentos (#articulo/..., #area-..., #inicio)
     ----------------------------------------------------------------------- */
  function route() {
    const hash = location.hash;
    if (hash.startsWith('#articulo/')) {
      const article = articlesById.get(decodeURIComponent(hash.slice(10)));
      readerActive = true;
      document.body.classList.add('is-reading');
      landing.hidden = true;
      reader.hidden = false;
      renderArticle(article);
      document.title = `${article?.title || 'Artículo no encontrado'} · Boletín DPI`;
      setCurrent(navLinks, '', 'location');
      scrollInstant(0);
      const h1 = $('h1', reader);
      if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
      onScroll();
      return;
    }

    const wasReading = readerActive;
    readerActive = false;
    document.body.classList.remove('is-reading');
    landing.hidden = false;
    reader.hidden = true;
    document.title = `Boletín DPI · CFIA · Edición ${data.edition}`;
    if (!wasReading) return; // en la portada el navegador hace el scroll suave nativo

    const context = returnContext;
    returnContext = null;
    requestAnimationFrame(() => {
      if (context && hash === context.hash) {
        scrollInstant(context.y);
        $$('[data-focus-key]').find(a => a.dataset.focusKey === context.key)?.focus({ preventScroll: true });
      } else {
        const target = document.getElementById(hash.slice(1)) || $('#inicio');
        target.scrollIntoView({ behavior: 'instant' });
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
      onScroll();
    });
  }

  // Guarda el punto de retorno al abrir un artículo desde la portada.
  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (a.target !== '_blank' && a.getAttribute('href')?.startsWith('#articulo/') && !readerActive) {
      returnContext = { hash: location.hash, y: window.scrollY, key: a.dataset.focusKey };
    }
    // Enlaces a secciones: mover el foco al destino (accesibilidad) sin romper el scroll suave.
    const href = a.getAttribute('href') || '';
    if (!readerActive && href.startsWith('#') && !href.startsWith('#articulo/')) {
      const target = document.getElementById(href.slice(1));
      if (target) {
        target.tabIndex = -1;
        setTimeout(() => target.focus({ preventScroll: true }), reduceMotion.matches ? 0 : 450);
      }
    }
  });

  /* -----------------------------------------------------------------------
     Inicio
     ----------------------------------------------------------------------- */
  populateEdition();
  $$('a[href]').forEach(a => {
    if (isExternal(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  });
  observeStaticReveals();
  updateHeights();
  window.addEventListener('hashchange', route);
  route();

  // Carga directa con #area-...: el destino se creó por JS, así que se ubica ahora.
  if (!readerActive && location.hash.length > 1) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'instant' }));
  }
  onScroll();
})();
