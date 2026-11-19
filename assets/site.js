// Looping footage: plays only while on screen, stays still for visitors who ask for
// reduced motion, and always offers a pause control.
(function () {
  var clips = Array.prototype.slice.call(document.querySelectorAll('video[data-loop]'));

  var prefersStill = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var paused = prefersStill;
  var onScreen = new Set();

  function sync(clip) {
    if (!paused && onScreen.has(clip)) {
      var attempt = clip.play();
      if (attempt && attempt.catch) attempt.catch(function () { /* autoplay refused: the poster stays */ });
    } else {
      clip.pause();
    }
  }

  function prepare(clip) {
    clip.muted = true;
    // A clip that cannot load is hidden so the frame's own gradient shows instead.
    // The failure can land before this script runs, so check the current state as well.
    function hideIfBroken() { if (clip.error || clip.networkState === 3) clip.hidden = true; }
    clip.addEventListener('error', hideIfBroken);
    hideIfBroken();
  }
  clips.forEach(prepare);

  var watcher = null;
  if ('IntersectionObserver' in window) {
    watcher = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) onScreen.add(entry.target); else onScreen.delete(entry.target);
        sync(entry.target);
      });
    }, { threshold: 0.2 });
  }
  function watch(clip) {
    if (watcher) { watcher.observe(clip); } else { onScreen.add(clip); sync(clip); }
  }
  clips.forEach(watch);
  // Footage that arrives later, when locked sections are unlocked.
  window.ijpAddClips = function (nodes) {
    Array.prototype.forEach.call(nodes, function (clip) { clips.push(clip); prepare(clip); watch(clip); });
  };

  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'motion-toggle';
  function label() { button.textContent = paused ? 'Play footage' : 'Pause footage'; }
  button.addEventListener('click', function () {
    paused = !paused;
    label();
    clips.forEach(sync);
  });
  label();
  document.body.appendChild(button);
})();

// Mark the section in view in the page outline.
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.pagemap a'));
  if (!links.length || !('IntersectionObserver' in window)) return;
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
  var seen = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      links.forEach(function (a) { a.classList.remove('on'); a.removeAttribute('aria-current'); });
      var a = byId[entry.target.id];
      a.classList.add('on');
      a.setAttribute('aria-current', 'location');
    });
  }, { rootMargin: '-25% 0px -70% 0px' });
  Object.keys(byId).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) seen.observe(el);
  });
})();

// Keep section headings clear of the sticky bar, whose height depends on the screen width.
(function () {
  var bar = document.querySelector('header.nav');
  if (!bar) return;
  var clearance = 16;
  function fit() {
    document.documentElement.style.scrollPaddingTop = (bar.offsetHeight + clearance) + 'px';
  }
  fit();
  window.addEventListener('resize', fit);
})();

// Copy the email address, for readers whose mail links open nothing. Delegated, because
// the buttons arrive only after the page is unlocked.
document.addEventListener('click', function (event) {
  var button = event.target.closest ? event.target.closest('[data-copy]') : null;
  if (!button) return;
  var label = button.getAttribute('data-label') || button.textContent;
  button.setAttribute('data-label', label);
  var text = button.getAttribute('data-copy');
  function done(message) {
    button.textContent = message;
    setTimeout(function () { button.textContent = label; }, 2500);
  }
  if (!navigator.clipboard) { done(text); return; }
  navigator.clipboard.writeText(text).then(function () { done('Copied'); }, function () { done(text); });
});

// Access gate: locked sections are blurred placeholders. A visitor verifies a work email
// with a code, and the real sections, phone number and resume links come from the server.
(function () {
  var API = 'https://spectrusol973.tailb6ca66.ts.net';
  var KEY = 'ijp-access';
  var page = document.body.getAttribute('data-page');
  var dialog = null;

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (name) { node.setAttribute(name, attrs[name]); });
    if (text) node.textContent = text;
    return node;
  }
  function stored() { try { return localStorage.getItem(KEY); } catch (ignored) { return null; } }
  function store(token) { try { if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY); } catch (ignored) { /* optional */ } }

  function post(path, payload) {
    return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (response) { return response.json().then(function (data) { return { ok: response.ok && data.ok, data: data }; }); });
  }

  // The phone number arrives with the unlocked content and is shown only when asked for.
  var ownerPhone = '';
  document.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('[data-show-phone]') : null;
    if (!button || !ownerPhone) return;
    var link = el('a', { 'class': button.className, href: 'tel:' + ownerPhone.replace(/[^0-9+]/g, '') }, ownerPhone);
    button.parentNode.replaceChild(link, button);
    link.focus();
  });

  function apply(token, data) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-gate]'), function (block) {
      var html = data.sections[block.getAttribute('data-gate')];
      if (typeof html !== 'string') return;
      block.innerHTML = html;
      block.classList.remove('locked');
      block.removeAttribute('inert');
      block.removeAttribute('aria-hidden');
      block.removeAttribute('data-gate');
      if (window.ijpAddClips) window.ijpAddClips(block.querySelectorAll('video[data-loop]'));
    });
    Array.prototype.forEach.call(document.querySelectorAll('.lock-note, .preview-bar'), function (note) { note.parentNode.removeChild(note); });
    ownerPhone = data.phone;
    Array.prototype.forEach.call(document.querySelectorAll('[data-resume]'), function (link) {
      link.href = API + '/contact/resume?kind=' + link.getAttribute('data-resume') + '&t=' + encodeURIComponent(token);
      link.removeAttribute('data-resume');
    });
    document.body.classList.add('unlocked');
    if (data.owner) showOwnerButton(token);
  }

  // Owner tools: shown only when the server says this session is the owner's. Guest links
  // let invited people read the site without the form; each can be switched off.
  var GUEST_DAYS = [1, 7, 30, 90];
  var DEFAULT_GUEST_DAYS = 7;
  var ownerDialog = null;

  function ownerCall(token, method, path, payload) {
    var options = { method: method, headers: { Authorization: 'Bearer ' + token } };
    if (payload) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(payload); }
    return fetch(API + path, options).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok || !data.ok) throw new Error(data.error || 'That did not work.');
        return data;
      });
    });
  }
  function day(seconds) {
    return new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function showOwnerButton(token) {
    if (document.querySelector('.owner-button')) return;
    var button = el('button', { type: 'button', 'class': 'owner-button' }, 'Owner: guest links');
    button.addEventListener('click', function () { openOwner(token); });
    document.body.appendChild(button);
  }

  function openOwner(token) {
    if (ownerDialog) { ownerDialog.showModal(); ownerDialog.refresh(); return; }
    ownerDialog = el('dialog', { 'class': 'gate-dialog owner-dialog', 'aria-labelledby': 'owner-title' });
    var shut = el('button', { type: 'button', 'class': 'x', 'aria-label': 'Close' }, '\u00d7');
    shut.addEventListener('click', function () { ownerDialog.close(); });
    var title = el('h2', { id: 'owner-title' }, 'Guest links');
    var intro = el('p', {}, 'Create a link for someone you trust. Opening it shows the full site with no blur and no form. Everyone else still sees the locked site.');
    var form = el('form', { novalidate: '' });
    var label = field(form, 'Who is it for?', { type: 'text', name: 'guest-label', required: '', maxlength: '80', autocomplete: 'off' });
    form.appendChild(el('label', { 'for': 'gate-guest-days' }, 'Works for'));
    var days = el('select', { id: 'gate-guest-days', name: 'guest-days' });
    GUEST_DAYS.forEach(function (count) {
      var option = el('option', { value: String(count) }, count === 1 ? '1 day' : count + ' days');
      if (count === DEFAULT_GUEST_DAYS) option.selected = true;
      days.appendChild(option);
    });
    form.appendChild(days);
    var create = el('button', { type: 'submit', 'class': 'btn' }, 'Create link');
    form.appendChild(create);
    var fresh = el('div', { 'class': 'owner-fresh' });
    fresh.hidden = true;
    var error = el('p', { 'class': 'err', role: 'alert' });
    error.hidden = true;
    var listTitle = el('h3', {}, 'Links you have made');
    var list = el('ul', { 'class': 'owner-list' });
    // Lets the owner see the site as a stranger does, on this device only.
    var lock = el('button', { type: 'button', 'class': 'link owner-lock' }, 'Lock this device (see the site as a visitor)');
    lock.addEventListener('click', function () { store(null); location.reload(); });
    [shut, title, intro, form, fresh, error, listTitle, list, lock].forEach(function (node) { ownerDialog.appendChild(node); });
    document.body.appendChild(ownerDialog);

    function problem(message) { error.textContent = message; error.hidden = false; }

    function row(guest) {
      var item = el('li', {});
      var state = guest.active ? 'On until ' + day(guest.expires_at) : 'Off';
      var used = guest.uses ? 'opened ' + guest.uses + (guest.uses === 1 ? ' time' : ' times') : 'not opened yet';
      item.appendChild(el('strong', {}, guest.label));
      item.appendChild(el('span', {}, state + ' \u00b7 ' + used));
      if (guest.active) {
        var off = el('button', { type: 'button', 'class': 'link' }, 'Switch off');
        off.addEventListener('click', function () {
          off.disabled = true;
          ownerCall(token, 'POST', '/contact/owner/guests/revoke', { id: guest.id })
            .then(refresh, function (failure) { off.disabled = false; problem(failure.message); });
        });
        item.appendChild(off);
      }
      return item;
    }

    function refresh() {
      error.hidden = true;
      return ownerCall(token, 'GET', '/contact/owner/guests').then(function (data) {
        list.textContent = '';
        if (!data.guests.length) { list.appendChild(el('li', {}, 'None yet.')); return; }
        data.guests.forEach(function (guest) { list.appendChild(row(guest)); });
      }, function (failure) { problem(failure.message); });
    }
    ownerDialog.refresh = refresh;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      error.hidden = true;
      if (label.value.trim().length < 2) { problem('Enter a name for this link.'); label.focus(); return; }
      create.disabled = true;
      ownerCall(token, 'POST', '/contact/owner/guests', { label: label.value.trim(), days: Number(days.value) })
        .then(function (data) {
          var link = location.origin + '/#guest=' + data.key;
          fresh.textContent = '';
          fresh.appendChild(el('p', {}, 'Link for ' + data.label + '. Copy it now; it is shown only once.'));
          fresh.appendChild(el('code', {}, link));
          fresh.appendChild(el('button', { type: 'button', 'class': 'btn', 'data-copy': link }, 'Copy link'));
          fresh.hidden = false;
          label.value = '';
          return refresh();
        }, function (failure) { problem(failure.message); })
        .then(function () { create.disabled = false; });
    });

    ownerDialog.showModal();
    refresh();
  }

  // A guest link carries its key after the # so it is never sent to the page host.
  function guestKey() {
    var match = /(?:^#|&)guest=([A-Za-z0-9_-]{20,64})(?:&|$)/.exec(location.hash);
    return match ? match[1] : null;
  }
  function useGuestLink(key) {
    history.replaceState(null, '', location.pathname + location.search);
    return post('/contact/guest', { key: key }).then(function (outcome) {
      if (!outcome.ok) throw new Error('refused');
      store(outcome.data.token);
      return load(outcome.data.token);
    }).catch(function () {
      var note = document.querySelector('.preview-bar span');
      if (note) note.textContent = 'This guest link has expired or been switched off. Verify your work email to read the full profile.';
    });
  }

  function load(token) {
    return fetch(API + '/contact/content?page=' + encodeURIComponent(page), { headers: { Authorization: 'Bearer ' + token } })
      .then(function (response) {
        if (response.status === 401) { store(null); throw new Error('expired'); }
        return response.json();
      })
      .then(function (data) { if (!data.ok) throw new Error('refused'); apply(token, data); });
  }

  function field(form, label, attrs) {
    var id = 'gate-' + attrs.name;
    attrs.id = id;
    var input = el('input', attrs);
    form.appendChild(el('label', { 'for': id }, label));
    form.appendChild(input);
    return input;
  }

  function open() {
    if (dialog) { dialog.showModal(); return; }
    dialog = el('dialog', { 'class': 'gate-dialog', 'aria-labelledby': 'gate-title' });
    var shut = el('button', { type: 'button', 'class': 'x', 'aria-label': 'Close' }, '\u00d7');
    shut.addEventListener('click', function () { dialog.close(); });
    var title = el('h2', { id: 'gate-title' }, 'Read the full profile');
    var intro = el('p', {}, 'Enter your details and a six-digit code is emailed to you. The full profile, phone number and resume unlock as soon as you enter it.');
    var form = el('form', { novalidate: '' });
    var name = field(form, 'Your name', { type: 'text', name: 'name', autocomplete: 'name', required: '', maxlength: '80' });
    var company = field(form, 'Company', { type: 'text', name: 'company', autocomplete: 'organization', required: '', maxlength: '80' });
    var email = field(form, 'Work email', { type: 'email', name: 'email', autocomplete: 'email', required: '', maxlength: '254' });
    var phone = field(form, 'Phone (optional)', { type: 'tel', name: 'phone', autocomplete: 'tel', maxlength: '32' });
    var trapWrap = el('div', { 'class': 'trap' });
    var trap = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    trapWrap.appendChild(trap);
    form.appendChild(trapWrap);
    var send = el('button', { type: 'submit', 'class': 'btn' }, 'Email me a code');
    form.appendChild(send);
    var codeForm = el('form', { novalidate: '' });
    codeForm.hidden = true;
    var code = field(codeForm, 'Six-digit code', { type: 'text', name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', required: '', maxlength: '6', pattern: '[0-9]{6}' });
    var confirm = el('button', { type: 'submit', 'class': 'btn' }, 'Unlock');
    codeForm.appendChild(confirm);
    var again = el('button', { type: 'button', 'class': 'link' }, 'Use a different email');
    codeForm.appendChild(again);
    var error = el('p', { 'class': 'err', role: 'alert' });
    error.hidden = true;
    var small = el('small', {}, 'Your details go only to Ira, so he knows who is reading. Personal mailboxes such as Gmail are not accepted.');
    [shut, title, intro, form, codeForm, error, small].forEach(function (node) { dialog.appendChild(node); });
    document.body.appendChild(dialog);

    function fail(button, label, message) {
      error.textContent = message;
      error.hidden = false;
      button.disabled = false;
      button.textContent = label;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      error.hidden = true;
      if (name.value.trim().length < 2) { fail(send, 'Email me a code', 'Enter your name.'); name.focus(); return; }
      if (company.value.trim().length < 2) { fail(send, 'Email me a code', 'Enter your company.'); company.focus(); return; }
      if (!email.value.trim() || !email.checkValidity()) { fail(send, 'Email me a code', 'Enter a valid work email address.'); email.focus(); return; }
      send.disabled = true;
      send.textContent = 'Sending';
      post('/contact/start', { name: name.value, company: company.value, email: email.value.trim(), phone: phone.value.trim(), website: trap.value, page: location.pathname })
        .then(function (outcome) {
          if (!outcome.ok) { fail(send, 'Email me a code', outcome.data.error || 'That did not work. Please try again in a few minutes.'); return; }
          send.disabled = false;
          send.textContent = 'Email me a code';
          form.hidden = true;
          codeForm.hidden = false;
          intro.textContent = 'A code is on its way to ' + email.value.trim() + '. It works for 15 minutes.';
          code.focus();
        })
        .catch(function () { fail(send, 'Email me a code', 'Could not reach the server. Please try again in a few minutes.'); });
    });

    codeForm.addEventListener('submit', function (event) {
      event.preventDefault();
      error.hidden = true;
      if (!/^[0-9]{6}$/.test(code.value.trim())) { fail(confirm, 'Unlock', 'Enter the six-digit code from the email.'); code.focus(); return; }
      confirm.disabled = true;
      confirm.textContent = 'Checking';
      post('/contact/verify', { email: email.value.trim(), code: code.value.trim() })
        .then(function (outcome) {
          if (!outcome.ok) { fail(confirm, 'Unlock', outcome.data.error || 'That did not work.'); return; }
          store(outcome.data.token);
          return load(outcome.data.token).then(function () { dialog.close(); });
        })
        .catch(function () { fail(confirm, 'Unlock', 'Could not load the profile. Please try again.'); });
    });

    again.addEventListener('click', function () {
      error.hidden = true;
      codeForm.hidden = true;
      form.hidden = false;
      code.value = '';
      intro.textContent = 'Enter your details and a six-digit code is emailed to you.';
      email.focus();
    });

    dialog.showModal();
  }

  document.addEventListener('click', function (event) {
    if (document.body.classList.contains('unlocked')) return;
    var trigger = event.target.closest ? event.target.closest('[data-unlock], [data-resume]') : null;
    if (!trigger) return;
    event.preventDefault();
    open();
  });

  // Audio summary: a small player that stays in the corner as the page scrolls. The clip
  // is served only to verified visitors, so before that the button opens the form.
  var CLIPS = { 'index': '5:18', 'biography': '1:05', 'career-story': '0:59', 'ai-laboratory': '1:16', 'video-production': '1:18' };
  (function () {
    var length = CLIPS[page];
    if (!length) return;
    var box = el('div', { 'class': 'listen', role: 'group', 'aria-label': 'Audio summary of this page' });
    var play = el('button', { type: 'button', 'class': 'listen-play', 'data-unlock': '', 'aria-label': 'Play the audio summary' });
    var status = el('span', { 'class': 'listen-status' }, 'Listen \u00b7 ' + length);
    var seek = el('input', { type: 'range', 'class': 'listen-seek', min: '0', max: '1000', value: '0', 'aria-label': 'Position in the audio summary' });
    seek.hidden = true;
    // Topic chapters arrive with the unlocked page content and fill this list.
    var chapters = el('ol', { 'class': 'listen-chapters', id: 'listen-chapters', 'data-gate': 'audio-chapters', 'aria-label': 'Topics in the audio summary' });
    // Open from the start where there is room beside the page; one tap away on small screens.
    var roomy = !!window.matchMedia && window.matchMedia('(min-width: 1180px) and (min-height: 820px)').matches;
    chapters.hidden = !roomy;
    var toggle = el('button', { type: 'button', 'class': 'listen-toggle', 'aria-expanded': String(roomy), 'aria-controls': 'listen-chapters' }, 'Topics');
    [chapters, play, status, seek, toggle].forEach(function (node) { box.appendChild(node); });
    document.body.appendChild(box);
    var clip = null;

    function clock(seconds) {
      var whole = Math.floor(seconds || 0);
      return Math.floor(whole / 60) + ':' + ('0' + (whole % 60)).slice(-2);
    }
    function show() {
      var playing = clip && !clip.paused;
      box.classList.toggle('playing', !!playing);
      play.setAttribute('aria-label', playing ? 'Pause the audio summary' : 'Play the audio summary');
      if (!clip) return;
      status.textContent = clock(clip.currentTime) + ' / ' + length;
      if (clip.duration) seek.value = String(Math.round(clip.currentTime / clip.duration * 1000));
    }
    function start() {
      clip = new Audio(API + '/contact/audio?page=' + encodeURIComponent(page) + '&t=' + encodeURIComponent(stored() || ''));
      clip.preload = 'auto';
      ['play', 'pause', 'timeupdate', 'ended'].forEach(function (name) { clip.addEventListener(name, show); });
      clip.addEventListener('error', function () {
        clip = null;
        seek.hidden = true;
        box.classList.remove('playing');
        status.textContent = 'Could not play. Try again.';
      });
      seek.hidden = false;
    }
    play.addEventListener('click', function () {
      if (!document.body.classList.contains('unlocked')) return; // the gate opens the form instead
      if (!clip) start();
      if (clip.paused) resume(); else clip.pause();
    });
    function resume() {
      var attempt = clip.play();
      if (attempt && attempt.catch) attempt.catch(function () { /* the error handler reports it */ });
    }
    toggle.addEventListener('click', function () {
      chapters.hidden = !chapters.hidden;
      toggle.setAttribute('aria-expanded', String(!chapters.hidden));
    });
    chapters.addEventListener('click', function (event) {
      var chapter = event.target.closest ? event.target.closest('[data-seek]') : null;
      if (!chapter) return;
      var seconds = Number(chapter.getAttribute('data-seek'));
      if (!clip) start();
      // A clip that has not loaded yet cannot seek, so jump once its length is known.
      if (clip.readyState > 0) { clip.currentTime = seconds; } else {
        clip.addEventListener('loadedmetadata', function () { clip.currentTime = seconds; }, { once: true });
      }
      resume();
    });
    seek.addEventListener('input', function () {
      if (clip && clip.duration) clip.currentTime = seek.value / 1000 * clip.duration;
    });
  })();

  var invited = guestKey();
  if (invited && page) { useGuestLink(invited); return; }

  var token = stored();
  if (token && page) load(token).catch(function () { /* stays locked; the visitor can verify again */ });
})();
