// LogMaster · JS mínimo del frontend (fase 5, Leptos SSR sin hidratación).
// El servidor renderiza el HTML; este script solo: llama a la API de la
// fase 4 (fetch con cookies + CSRF por doble envío), mueve las listas
// con SSE (con sondeo cada 15 s si se pierde) y captura fotos con
// getUserMedia. No guarda tokens: las cookies son HttpOnly.
(function () {
  'use strict';

  function cookieValue(name) {
    var parts = document.cookie.split(';');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].trim().split('=');
      if (kv[0] === name) return decodeURIComponent(kv.slice(1).join('='));
    }
    return '';
  }

  function showError(form, message) {
    var box = form ? form.querySelector('[data-error]') : null;
    if (box) {
      box.textContent = message;
      box.hidden = false;
    } else {
      alert(message);
    }
  }

  // Llamada a la API con la sesión por cookie. 401 -> al login con el
  // destino actual, como el hook de sesión del cliente anterior.
  async function api(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    var csrf = cookieValue('__Host-logmaster-csrf');
    if (csrf) headers['x-csrf-token'] = csrf;
    var res = await fetch(path, {
      method: method,
      headers: headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) {
      window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname + window.location.search);
      throw new Error('Sesión requerida');
    }
    var data = await res.json().catch(function () { return null; });
    if (!res.ok || !data || data.success === false) {
      var err = new Error((data && data.error && data.error.message) || ('Error ' + res.status));
      err.code = data && data.error && data.error.code;
      err.status = res.status;
      throw err;
    }
    return data.data;
  }

  function safeReturnTo(value) {
    if (!value || value.charAt(0) !== '/' || value.indexOf('//') === 0 || value.indexOf('\\') !== -1) return '/';
    return value;
  }

  // ---- Formularios de autenticación -------------------------------------
  var loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = loginForm.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await api('POST', '/api/v1/auth/login', {
          username: loginForm.username.value.trim(),
          password: loginForm.password.value,
        });
        var dest = safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'));
        window.location.href = dest;
      } catch (err) {
        showError(loginForm, err.code === 'ACCOUNT_LOCKED' ? 'Cuenta bloqueada temporalmente. Inténtalo más tarde.' : 'Credenciales inválidas.');
        btn.disabled = false;
      }
    });
  }

  var forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      try {
        var data = await api('POST', '/api/v1/auth/forgot-password', { username: forgotForm.username.value.trim() });
        showError(forgotForm, '');
        var ok = forgotForm.querySelector('[data-ok]');
        if (ok) { ok.textContent = data.message; ok.hidden = false; }
      } catch (err) { showError(forgotForm, err.message); }
    });
  }

  var resetForm = document.getElementById('reset-form');
  if (resetForm) {
    resetForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (resetForm.newPassword.value !== resetForm.confirmPassword.value) {
        showError(resetForm, 'Las contraseñas no coinciden.');
        return;
      }
      try {
        await api('POST', '/api/v1/auth/reset-password', {
          token: resetForm.token.value,
          newPassword: resetForm.newPassword.value,
        });
        window.location.href = '/login';
      } catch (err) { showError(resetForm, err.message); }
    });
  }

  var changeForm = document.getElementById('change-password-form');
  if (changeForm) {
    changeForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (changeForm.newPassword.value !== changeForm.confirmPassword.value) {
        showError(changeForm, 'Las contraseñas no coinciden.');
        return;
      }
      try {
        await api('POST', '/api/v1/auth/change-password', {
          currentPassword: changeForm.currentPassword.value,
          newPassword: changeForm.newPassword.value,
          confirmPassword: changeForm.confirmPassword.value,
        });
        window.location.href = '/';
      } catch (err) { showError(changeForm, err.message); }
    });
  }

  // ---- Cierre de sesión --------------------------------------------------
  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function () {
      try { await api('POST', '/logout', {}); } catch (err) { /* la sesión ya no vale: igual se sale */ }
      window.location.href = '/login';
    });
  }

  // ---- Acciones genéricas: botones con data-api --------------------------
  // data-api="/api/v1/visits/12/admit" data-method="POST"
  // data-confirm="¿Admitir esta visita?" data-reason="Motivo de cancelación:"
  // data-done="recargar" (o una URL). El cuerpo es {} salvo motivo.
  document.addEventListener('click', async function (ev) {
    var el = ev.target.closest('[data-api]');
    if (!el) return;
    ev.preventDefault();
    if (el.dataset.confirm && !window.confirm(el.dataset.confirm)) return;
    var body = {};
    if (el.dataset.reason) {
      var reason = window.prompt(el.dataset.reason, '');
      if (reason === null) return;
      if (!reason.trim()) { alert('Indica el motivo.'); return; }
      body.reason = reason.trim();
    }
    el.disabled = true;
    try {
      await api(el.dataset.method || 'POST', el.dataset.api, body);
      if (el.dataset.done && el.dataset.done !== 'recargar') window.location.href = el.dataset.done;
      else window.location.reload();
    } catch (err) {
      alert(err.message);
      el.disabled = false;
    }
  });

  // ---- Listas en vivo (punto de control): SSE + sondeo cada 15 s --------
  var liveLists = document.getElementById('listas-vivo');
  if (liveLists) {
    var timers = { sseOk: false };
    function rowHtml(v) {
      var name = (v.firstName || '') + ' ' + (v.lastName || '');
      var cedula = v.visitorCedula || 'Anonimizado';
      var empresa = v.visitorCompany || v.company || '';
      var estado = v.status || '';
      var entrada = v.checkInTime || v.arrivalTime || '';
      var link = '/visits/' + v.id;
      var accion = '';
      if (estado === 'waiting') accion = '<a class="boton" href="' + link + '">Admitir</a>';
      else if (estado === 'active') accion = '<a class="boton" href="' + link + '">Ver</a>';
      else if (estado === 'intermittent') accion = '<a class="boton" href="' + link + '">Reingreso</a>';
      return '<tr><td><a href="' + link + '">' + escapeHtml(name.trim() || cedula) + '</a></td>' +
        '<td>' + escapeHtml(cedula) + '</td><td>' + escapeHtml(empresa) + '</td>' +
        '<td>' + escapeHtml(v.purpose || '') + '</td><td>' + escapeHtml(entrada) + '</td>' +
        '<td><span class="etiqueta ' + escapeHtml(estado) + '">' + escapeHtml(estado) + '</span></td>' +
        '<td>' + accion + '</td></tr>';
    }
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    async function refreshLists() {
      for (var i = 0; i < 3; i++) {
        var status = ['waiting', 'active', 'intermittent'][i];
        var tbody = document.querySelector('[data-lista="' + status + '"] tbody');
        var count = document.querySelector('[data-cuenta="' + status + '"]');
        if (!tbody) continue;
        try {
          var items = await api('GET', '/api/v1/visits/' + status);
          tbody.innerHTML = items.length
            ? items.map(rowHtml).join('')
            : '<tr><td colspan="7" class="muted">Sin visitas.</td></tr>';
          if (count) count.textContent = items.length;
        } catch (err) { /* se reintenta en el siguiente ciclo */ }
      }
    }
    try {
      var source = new EventSource('/api/v1/events/visits');
      source.onmessage = function () { refreshLists(); };
      source.onerror = function () { timers.sseOk = false; };
      source.onopen = function () { timers.sseOk = true; };
    } catch (err) { /* sin EventSource: solo sondeo */ }
    window.setInterval(function () { if (!timers.sseOk) refreshLists(); }, 15000);
  }

  // ---- Cámara y fotos (check-in) -----------------------------------------
  var cameraBtn = document.getElementById('camara-btn');
  var cameraVideo = document.getElementById('camara');
  var stream = null;
  if (cameraBtn && cameraVideo) {
    cameraBtn.addEventListener('click', async function () {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        cameraVideo.srcObject = stream;
        cameraVideo.hidden = false;
        document.getElementById('capturar-btn').hidden = false;
        cameraBtn.hidden = true;
      } catch (err) {
        alert('No se pudo abrir la cámara. Usa la subida de archivo.');
      }
    });
    var shotBtn = document.getElementById('capturar-btn');
    if (shotBtn) {
      shotBtn.addEventListener('click', function () {
        var canvas = document.createElement('canvas');
        canvas.width = cameraVideo.videoWidth || 640;
        canvas.height = cameraVideo.videoHeight || 480;
        canvas.getContext('2d').drawImage(cameraVideo, 0, 0);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        document.getElementById('photoBase64').value = dataUrl;
        document.getElementById('foto-vista').src = dataUrl;
        document.getElementById('foto-vista').hidden = false;
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        cameraVideo.hidden = true;
        shotBtn.hidden = true;
        cameraBtn.hidden = false;
      });
    }
  }
})();
