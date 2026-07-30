/**
 * Standalone OAuth callback — served as a real file (before SPA rewrite).
 * Survives stale service-worker app-shell / missing hashed Vue chunks.
 */
export function buildWahooCallbackHtml(clientId: string): string {
  const idJson = JSON.stringify(clientId || '')
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Wahoo verbinden…</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: system-ui, sans-serif; background: #f8faf9; color: #111; text-align: center; padding: 2rem; }
    .box { max-width: 24rem; }
    .err { color: #b91c1c; font-size: 0.9rem; word-break: break-word; }
    a { color: #2d6a4f; font-weight: 700; }
  </style>
</head>
<body>
  <div class="box">
    <p id="msg">Wahoo wird verbunden…</p>
    <p id="detail" class="err" hidden></p>
    <p id="home" hidden><a href="/">Zurück zu UltraPlaner</a></p>
  </div>
  <script>
(function () {
  var CLIENT_ID = ${idJson};
  var TOKEN_KEY = 'ultraplaner-wahoo-tokens';
  var PKCE_KEY = 'ultraplaner-wahoo-pkce';
  var AUTH = 'https://api.wahooligan.com/oauth/token';
  var msg = document.getElementById('msg');
  var detail = document.getElementById('detail');
  var home = document.getElementById('home');

  function fail(text) {
    msg.textContent = 'Wahoo-Verbindung fehlgeschlagen.';
    detail.hidden = false;
    detail.textContent = text || '';
    home.hidden = false;
  }

  function readPkce() {
    try {
      var raw = localStorage.getItem(PKCE_KEY);
      if (!raw) return null;
      localStorage.removeItem(PKCE_KEY);
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  var params = new URLSearchParams(location.search);
  if (params.get('error')) {
    fail(params.get('error'));
    return;
  }
  var code = params.get('code');
  if (!code) { fail('missing_code'); return; }
  if (!CLIENT_ID) { fail('client_id missing'); return; }

  var pending = readPkce();
  if (!pending || !pending.verifier) {
    fail('Sitzung abgelaufen — bitte erneut „Mit Wahoo verbinden“ tippen.');
    return;
  }

  var body = new URLSearchParams({
    client_id: CLIENT_ID,
    code: code,
    redirect_uri: location.origin + '/oauth/wahoo/callback',
    grant_type: 'authorization_code',
    code_verifier: pending.verifier
  });

  fetch(AUTH, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body
  }).then(function (res) {
    return res.text().then(function (text) {
      if (!res.ok) throw new Error('token ' + res.status + ': ' + text.slice(0, 180));
      return JSON.parse(text);
    });
  }).then(function (data) {
    if (!data.access_token || !data.refresh_token) throw new Error('token incomplete');
    var expiresIn = Number(data.expires_in) || 7200;
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000
    }));
    msg.textContent = 'Verbunden — zurück zur Karte…';
    var target = pending.returnUrl || '/';
    if (target.charAt(0) !== '/') target = '/';
    setTimeout(function () { location.replace(target); }, 500);
  }).catch(function (e) {
    fail(e && e.message ? e.message : String(e));
  });
})();
  </script>
</body>
</html>
`
}
