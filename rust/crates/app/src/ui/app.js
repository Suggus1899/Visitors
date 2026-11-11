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

  // La cédula se escribe con o sin prefijo: solo dígitos -> V-....
  function normalizeCedula(value) {
    var v = (value || '').trim().toUpperCase();
    if (/^\d{6,9}$/.test(v)) return 'V-' + v;
    return v;
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
  // Solo botones: los formularios data-api-form también llevan data-api
  // y un clic en su botón de envío no debe pasar por aquí (el
  // preventDefault cancelaría el submit del formulario).
  document.addEventListener('click', async function (ev) {
    var el = ev.target.closest('button[data-api]');
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

  // ---- Formularios genéricos contra la API --------------------------------
  // <form data-api-form data-method="PATCH" data-api="/api/v1/...">
  // Los checkbox van como booleanos; el resto, como texto.
  document.addEventListener('submit', async function (ev) {
    var form = ev.target.closest('form[data-api-form]');
    if (!form) return;
    ev.preventDefault();
    var body = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') body[el.name] = el.checked;
      else if (el.type !== 'file' && el.type !== 'submit' && el.type !== 'button') body[el.name] = el.value;
    });
    try {
      await api(form.dataset.method || 'POST', form.dataset.api, body);
      if (form.dataset.done) window.location.href = form.dataset.done;
      else window.location.reload();
    } catch (err) { showError(form, err.message); }
  });

  // ---- Búsqueda por cédula (punto de control) ------------------------------
  var buscarForm = document.getElementById('buscar-visitante');
  if (buscarForm) {
    buscarForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var cedula = normalizeCedula(document.getElementById('buscar-cedula').value);
      if (cedula) window.location.href = '/visitors/' + encodeURIComponent(cedula);
    });
  }

  // ---- Check-in -------------------------------------------------------------
  var checkinForm = document.getElementById('checkin-form');
  if (checkinForm) {
    var val = function (name) {
      var el = checkinForm.elements[name];
      return el ? el.value.trim() : '';
    };
    var perfilBtn = document.getElementById('buscar-perfil-btn');
    var perfilInfo = document.getElementById('perfil-info');
    if (perfilBtn) {
      perfilBtn.addEventListener('click', async function () {
        var cedula = normalizeCedula(val('visitorCedula'));
        if (!cedula) { alert('Escribe la cédula primero.'); return; }
        try {
          var p = await api('GET', '/api/v1/visitors/' + encodeURIComponent(cedula));
          checkinForm.elements['firstName'].value = p.firstName || '';
          checkinForm.elements['lastName'].value = p.lastName || '';
          checkinForm.elements['company'].value = p.company || '';
          checkinForm.elements['jobTitle'].value = p.jobTitle || '';
          checkinForm.elements['email'].value = p.email || '';
          checkinForm.elements['phone'].value = p.phone || '';
          perfilInfo.textContent = 'Perfil conocido: ' + (p.firstName || '') + ' ' + (p.lastName || '') +
            (p.isBlocked ? ' (BLOQUEADO: no puede registrar visitas)' : '') + '. Sus fotos se conservan.';
          perfilInfo.hidden = false;
        } catch (err) {
          if (err.status === 404) {
            perfilInfo.textContent = 'Perfil nuevo: completa los datos del visitante.';
            perfilInfo.hidden = false;
          } else { showError(checkinForm, err.message); }
        }
      });
    }
    checkinForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = checkinForm.querySelector('button[type=submit]');
      btn.disabled = true;
      var body = {
        visitorCedula: normalizeCedula(val('visitorCedula')),
        purpose: val('purpose'),
        personToVisit: val('personToVisit'),
        targetDepartment: val('targetDepartment'),
        hostPerson: val('hostPerson'),
        status: val('status') || 'active',
        action: val('action') || 'Ninguna',
        notes: val('notes'),
        vehicleBrand: val('vehicleBrand'),
        vehicleModel: val('vehicleModel'),
        vehiclePlate: val('vehiclePlate'),
        area: val('area'),
        department: val('department'),
        visitorData: {
          firstName: val('firstName'), lastName: val('lastName'), company: val('company'),
          jobTitle: val('jobTitle'), email: val('email'), phone: val('phone'),
          photoBase64: val('photoBase64'), idPhotoBase64: val('idPhotoBase64'),
        },
        consent: {
          accepted: document.getElementById('consentimiento').checked,
          policyVersion: 'v1',
          acceptedAt: new Date().toISOString(),
        },
      };
      try {
        var created = await api('POST', '/api/v1/visits/checkin', body);
        window.location.href = '/visits/' + created.id;
      } catch (err) {
        showError(checkinForm, err.message);
        btn.disabled = false;
      }
    });
    // Subida de archivo -> data-URI en el campo oculto + vista previa.
    var bindFile = function (inputId, hiddenId, previewId) {
      var input = document.getElementById(inputId);
      if (!input) return;
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          document.getElementById(hiddenId).value = reader.result;
          var img = document.getElementById(previewId);
          img.src = reader.result;
          img.hidden = false;
        };
        reader.readAsDataURL(file);
      });
    };
    bindFile('foto-archivo', 'photoBase64', 'foto-vista');
    bindFile('foto-documento-archivo', 'idPhotoBase64', 'foto-documento-vista');
  }

// Calendario de /admin: mes actual por fetch a la API.
var cal = document.getElementById('calendario');
if (cal) {
  var now = new Date();
  var first = new Date(now.getFullYear(), now.getMonth(), 1);
  var last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  var fmt = function (d) { return d.toISOString().slice(0, 10); };
  api('GET', '/api/v1/visits/calendar?startDate=' + fmt(first) + '&endDate=' + fmt(last)).then(function (data) {
    var rows = (data.days || []).map(function (d) {
      return '<tr><td>' + d.date + '</td><td>' + d.count + '</td></tr>';
    }).join('');
    cal.innerHTML = '<table><thead><tr><th>Día</th><th>Visitas</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="2" class="muted">Sin visitas este mes.</td></tr>') + '</tbody></table>';
  }).catch(function (err) {
    cal.innerHTML = '<div class="alerta error">' + err.message + '</div>';
  });
}

// Estadísticas de /admin: cuatro paneles por fetch a la API.
var est = document.getElementById('estadisticas');
if (est) {
  var fill = function (id, url) {
    var pre = document.getElementById(id);
    if (!pre) return;
    api('GET', url).then(function (data) {
      pre.textContent = JSON.stringify(data, null, 2);
    }).catch(function (err) {
      pre.textContent = 'Error: ' + err.message;
    });
  };
  fill('stats-resumen', '/api/v1/reports/stats');
  fill('stats-mensual', '/api/v1/reports/monthly');
  fill('stats-comparativo', '/api/v1/reports/comparison');
  fill('stats-alertas', '/api/v1/reports/alerts');
}

// Consulta del titular y cancelación (anonimización) en /privacy.
var consultaForm = document.getElementById('consultar-titular');
if (consultaForm) {
  consultaForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var cedula = normalizeCedula(document.getElementById('consulta-cedula').value);
    var out = document.getElementById('consulta-resultado');
    if (!cedula || !out) return;
    api('GET', '/api/v1/privacy/subjects/' + encodeURIComponent(cedula)).then(function (data) {
      out.textContent = JSON.stringify(data, null, 2);
    }).catch(function (err) {
      out.textContent = 'Error: ' + err.message;
    });
  });
}
var cancelarForm = document.getElementById('cancelar-titular');
if (cancelarForm) {
  cancelarForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var cedula = normalizeCedula(document.getElementById('cancelar-cedula').value);
    if (!cedula) return;
    if (!confirm('Anonimizar todos los datos del titular ' + cedula + '?')) return;
    api('DELETE', '/api/v1/privacy/subjects/' + encodeURIComponent(cedula)).then(function () {
      window.location.reload();
    }).catch(function (err) { alert(err.message); });
  });
}
})();
