// Take photos of a letter with the device camera, page by page, then read the
// text on the device. Photos stay in memory on this page only: they are never
// uploaded or saved, and the camera is turned off as soon as it is not needed.
//
// mountCamera(root, { read, onText, status }) where read(files) returns text.

const html = `
<div class="app-camera" data-state="idle">
  <div class="app-camera__idle">
    <button type="button" class="govuk-button govuk-!-margin-bottom-2" data-module="govuk-button" id="cam-start">Take a photo of the letter</button>
  </div>
  <div class="app-camera__live" hidden>
    <div class="app-camera__frame">
      <video id="cam-video" playsinline muted autoplay aria-label="Camera view"></video>
      <div class="app-camera__guide" aria-hidden="true"></div>
    </div>
    <p class="govuk-body govuk-!-margin-top-2">Fit the whole page inside the frame. Use good light and hold the phone flat above the letter.</p>
    <div class="govuk-button-group">
      <button type="button" class="govuk-button" data-module="govuk-button" id="cam-snap">Take photo</button>
      <button type="button" class="govuk-button govuk-button--secondary" data-module="govuk-button" id="cam-cancel">Cancel</button>
    </div>
  </div>
  <div class="app-camera__review" hidden>
    <img id="cam-preview" class="app-camera__preview" alt="The photo you just took">
    <p class="govuk-body govuk-!-margin-top-2">Check you can read all the words. If not, take it again.</p>
    <div class="govuk-button-group">
      <button type="button" class="govuk-button" data-module="govuk-button" id="cam-use">Use this photo</button>
      <button type="button" class="govuk-button govuk-button--secondary" data-module="govuk-button" id="cam-retake">Take it again</button>
    </div>
  </div>
  <div class="app-camera__pages" hidden>
    <h2 class="govuk-heading-s" id="cam-pages-title">Your photos</h2>
    <ul class="govuk-list app-camera__list" id="cam-list" aria-labelledby="cam-pages-title"></ul>
    <div class="govuk-button-group">
      <button type="button" class="govuk-button" data-module="govuk-button" id="cam-read">Read the letter</button>
      <button type="button" class="govuk-button govuk-button--secondary" data-module="govuk-button" id="cam-more">Add another page</button>
    </div>
  </div>
  <input type="file" id="cam-native" accept="image/*" capture="environment" hidden>
</div>`;

export function mountCamera(root, { read, onText, status }) {
  root.innerHTML = html;
  const $ = (id) => root.querySelector(`#${id}`);
  const parts = { idle: '.app-camera__idle', live: '.app-camera__live', review: '.app-camera__review' };
  const video = $('cam-video');
  let stream = null;
  let pending = null; // the photo being reviewed
  const pages = []; // { file, url }

  // idle: the start button, or the list of photos once there are some.
  const show = (state) => {
    root.querySelector(parts.live).hidden = state !== 'live';
    root.querySelector(parts.review).hidden = state !== 'review';
    root.querySelector(parts.idle).hidden = state !== 'idle' || pages.length > 0;
    root.querySelector('.app-camera__pages').hidden = state !== 'idle' || !pages.length;
  };
  const stop = () => {
    for (const t of stream?.getTracks() || []) t.stop();
    stream = null;
    video.srcObject = null;
  };
  const renderPages = () => {
    $('cam-list').innerHTML = pages.map((p, i) => `<li class="app-camera__item">
      <img src="${p.url}" alt="Page ${i + 1}" class="app-camera__thumb">
      <span class="govuk-body govuk-!-margin-bottom-0">Page ${i + 1}</span>
      <button type="button" class="govuk-button govuk-button--secondary govuk-!-margin-bottom-0" data-remove="${i}">Remove<span class="govuk-visually-hidden"> page ${i + 1}</span></button>
    </li>`).join('');
  };

  // Phones without camera access in the browser still have the camera app.
  const native = () => { status('Your camera will open. Take the photo, then come back here.'); $('cam-native').click(); };

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) return native();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false,
      });
    } catch {
      return native();
    }
    video.srcObject = stream;
    show('live');
    status('Camera on. Fit the page in the frame, then select Take photo.');
    $('cam-snap').focus();
  }

  function snap() {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d');
    // Greyscale helps the text reader.
    ctx.filter = 'grayscale(1) contrast(1.2)';
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => review(new File([blob], `page-${pages.length + 1}.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.92);
    stop();
  }

  function review(file) {
    pending = { file, url: URL.createObjectURL(file) };
    $('cam-preview').src = pending.url;
    show('review');
    status('Photo taken. Check you can read it.');
    $('cam-use').focus();
  }

  function use() {
    pages.push(pending);
    pending = null;
    renderPages();
    show('idle');
    status(`Page ${pages.length} added. Add another page, or read the letter.`);
    $('cam-read').focus();
  }

  function retake() {
    URL.revokeObjectURL(pending.url);
    pending = null;
    start();
  }

  async function readAll() {
    const button = $('cam-read');
    button.disabled = true;
    try {
      const text = await read(pages.map((p) => p.file));
      onText(text);
    } finally {
      button.disabled = false;
    }
  }

  // Forget the photos: used when leaving the page or after reading.
  function clear() {
    stop();
    for (const p of [...pages, pending].filter(Boolean)) URL.revokeObjectURL(p.url);
    pages.length = 0;
    pending = null;
    renderPages();
    show('idle');
  }

  $('cam-start').addEventListener('click', start);
  $('cam-more').addEventListener('click', start);
  $('cam-snap').addEventListener('click', snap);
  $('cam-cancel').addEventListener('click', () => { stop(); show('idle'); status(''); });
  $('cam-use').addEventListener('click', use);
  $('cam-retake').addEventListener('click', retake);
  $('cam-read').addEventListener('click', readAll);
  $('cam-native').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) review(f); });
  $('cam-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    const [p] = pages.splice(Number(b.dataset.remove), 1);
    URL.revokeObjectURL(p.url);
    renderPages();
    show('idle');
    status('Page removed.');
  });
  addEventListener('pagehide', clear);
  document.querySelector('.govuk-js-exit-this-page-button')?.addEventListener('click', clear);

  return { clear };
}
