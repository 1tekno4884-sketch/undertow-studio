/* Undertow live bits, loaded lazily by index.html (no libraries).
   Beacons: announcements posted by the owner from the Sonar/Ripple Owner Console (top of the page and on app cards).
   Harbor:  the discussion under the Sonar and Ripple cards. Guests read; sign in with a Ripple/Sonar account to post
            (same client-side password hashing as the Sonar web app). Every bit of user text goes in via textContent. */
(function () {
  "use strict";
  var LIVE = "https://ripple-api.undertowstudio.workers.dev";
  var K_API = "undertow_api", K_TOKEN = "undertow_site_token", K_DISMISS = "undertow_beacons_closed";
  var SONAR_WEB = "https://1tekno4884-sketch.github.io/sonar-web/";
  var d = document;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  // Local testing: open the page once with ?api=http://127.0.0.1:8787 (kept in localStorage; ?api=default goes back).
  var API = (function () {
    try {
      var q = new URLSearchParams(location.search).get("api");
      if (q === "default" || q === "") store(K_API, null);
      else if (q && /^https?:\/\/[A-Za-z0-9.:\-[\]]+\/?$/.test(q)) store(K_API, q.replace(/\/$/, ""));
    } catch (e) {}
    return store(K_API) || LIVE;
  })();
  var token = store(K_TOKEN);

  // ---------------------------------------------------------------- tiny DOM helpers (text only → no XSS)
  function h(tag, attrs) {
    var el = d.createElement(tag), i, k;
    for (k in attrs || {}) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === "object" ? c : d.createTextNode(String(c)));
  }
  function icon(name, fill) { return h("span", { class: "ms" + (fill ? " fill" : ""), "aria-hidden": "true" }, name); }
  function safeHref(u) { try { var x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch (e) { return null; } }
  /** Text with http(s) links made clickable — built from text nodes, never innerHTML. */
  function linkify(text) {
    var out = [], rx = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi, last = 0, m;
    while ((m = rx.exec(text))) {
      var raw = m[0].replace(/[.,!?)\]]+$/, ""), href = safeHref(/^www\./i.test(raw) ? "https://" + raw : raw);
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(href ? h("a", { href: href, target: "_blank", rel: "noopener nofollow ugc" }, raw) : raw);
      last = m.index + raw.length; rx.lastIndex = last;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }
  var rtf = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;
  function ago(ms) {
    var s = Math.round((ms - Date.now()) / 1000), a = Math.abs(s);
    if (!rtf) return new Date(ms).toLocaleString();
    if (a < 60) return rtf.format(Math.round(s), "second");
    if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
    if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
    if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
    return new Date(ms).toLocaleDateString();
  }
  var snackTimer;
  function toast(msg) {
    var s = d.getElementById("snack"), t = d.getElementById("snackText");
    if (!s || !t) return;
    var ic = s.querySelector(".ms"); if (ic) ic.textContent = "info";
    t.textContent = msg; s.classList.add("show");
    clearTimeout(snackTimer); snackTimer = setTimeout(function () { s.classList.remove("show"); if (ic) ic.textContent = "download_done"; }, 3600);
  }

  // ---------------------------------------------------------------- API
  function api(path, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (token && opts.auth !== false) headers.authorization = "Bearer " + token;
    return fetch(API + path, { method: opts.method || (opts.body !== undefined ? "POST" : "GET"), headers: headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined })
      .catch(function () { throw new Error("Can't reach the server — check your connection."); })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401 && token && opts.auth !== false) { setToken(null); throw new Error(j.error || "Please sign in again"); }
          if (!r.ok) throw new Error(j.error || "Something went wrong (" + r.status + ")");
          return j;
        });
      });
  }
  function setToken(t) { token = t || null; store(K_TOKEN, token); boards.forEach(function (b) { b.reload(); }); }
  /** Same as the Sonar/Ripple apps: base64url(PBKDF2-HMAC-SHA256(password, "ripple:" + username.lower(), 100 000, 32 bytes)). */
  function passwordHash(username, password) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]).then(function (key) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("ripple:" + username.trim().toLowerCase()), iterations: 100000 }, key, 256);
    }).then(function (bits) {
      return btoa(String.fromCharCode.apply(null, new Uint8Array(bits))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    });
  }
  var mediaUrl = function (k) { return typeof k === "string" && /^u\/[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+$/.test(k) && k.indexOf("..") < 0 ? API + "/media/" + k : null; };

  // ---------------------------------------------------------------- cards
  /** Card id = first word of its title, lower case: cobalt, tide, swell, lumen, wake, ripple, sonar, nava. */
  var cards = {};
  d.querySelectorAll("article.card").forEach(function (c) {
    var t = c.querySelector("h4"); if (!t) return;
    var id = t.textContent.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9-]/g, "");
    c.setAttribute("data-card", id); cards[id] = c;
  });

  // ---------------------------------------------------------------- Beacons (announcements)
  var closed = []; try { closed = JSON.parse(store(K_DISMISS) || "[]"); } catch (e) {}
  var STYLE_ICON = { info: "campaign", celebrate: "celebration", warning: "warning" };
  function beacon(a, where) {
    var link = safeHref(a.link);
    var el = h("div", { class: "beacon " + (STYLE_ICON[a.style] ? a.style : "info"), role: "status" },
      icon(STYLE_ICON[a.style] || "campaign", true),
      h("div", { class: "bc-body" }, h("b", null, a.title), a.text ? h("p", null, a.text) : null,
        link ? h("a", { class: "bc-link", href: link, target: "_blank", rel: "noopener" }, a.linkLabel || "Learn more", icon("arrow_outward")) : null),
      h("button", { class: "bc-x", type: "button", "aria-label": "Dismiss announcement", onclick: function () {
        closed = closed.concat(a.id + "@" + where).slice(-50); store(K_DISMISS, JSON.stringify(closed)); el.remove();
      } }, icon("close")));
    return el;
  }
  function showBeacons() {
    api("/v1/site/announcements?for=site", { auth: false }).then(function (j) {
      d.querySelectorAll(".beacon").forEach(function (x) { x.remove(); });
      (j.items || []).slice().reverse().forEach(function (a) {
        a.targets.forEach(function (t) {
          if (closed.indexOf(a.id + "@" + t) >= 0) return;
          if (t === "site") { var w = d.querySelector(".hero .wrap"); if (w) w.insertBefore(beacon(a, t), w.firstChild); }
          else if (t.indexOf("card:") === 0 && cards[t.slice(5)]) {
            var c = cards[t.slice(5)], after = c.querySelector(".desc") || c.querySelector(".card-top");
            after.parentNode.insertBefore(beacon(a, t), after.nextSibling);
          }
        });
      });
    }).catch(function () {});
  }

  // ---------------------------------------------------------------- Harbor (discussions)
  var BADGES = [["owner", "shield_person", "Owner"], ["verified", "verified", "Verified"], ["creator", "auto_awesome", "Verified creator"],
    ["brand", "storefront", "Verified brand"], ["org", "apartment", "Verified organisation"], ["dev", "code", "Developer"]];
  var boards = [];
  function colorOk(c) { return typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null; }
  function authorLine(a) {
    var av = mediaUrl(a.avatar);
    var bits = [av ? h("img", { class: "hb-av", src: av, alt: "", loading: "lazy", width: "32", height: "32" }) : h("span", { class: "hb-av", "aria-hidden": "true" }, (a.displayName || "?").trim().charAt(0).toUpperCase()),
      h("span", { class: "hb-name" }, a.displayName || a.username)];
    BADGES.forEach(function (b) { if (a.badges && a.badges[b[0]]) bits.push(h("span", { class: "hb-badge " + b[0], title: b[2], role: "img", "aria-label": b[2] }, icon(b[1], true))); });
    var r = a.ribbon;
    if (r && r.text) {
      var rb = h("span", { class: "hb-ribbon" }, r.icon && /^[a-z_]{2,40}$/.test(r.icon) ? icon(r.icon, true) : null, String(r.text).slice(0, 40));
      if (colorOk(r.color)) rb.style.setProperty("--rb1", r.color);
      if (colorOk(r.color2)) rb.style.setProperty("--rb2", r.color2);
      bits.push(rb);
    }
    if (a.id) bits.push(h("span", { class: "hb-user" }, "@" + a.username));
    return bits;
  }

  function Board(det) {
    var name = det.getAttribute("data-board"), app = name.charAt(0).toUpperCase() + name.slice(1);
    var root = det.querySelector(".hb"), sort = "new", cursor = null, me = null, items = [], loading = false, modOpen = false;
    var status = h("p", { class: "hb-note", "aria-live": "polite" });
    var list = h("ul", { class: "hb-list", "aria-label": app + " discussion posts" });
    var more = h("button", { class: "hb-btn tonal", type: "button", hidden: true, onclick: function () { load(false); } }, "Load more");
    var top = h("div", { class: "hb-bar" }), compose = h("div"), modBox = h("div");
    root.textContent = "";
    add(root, [top, compose, modBox, status, list, more]);

    function chip(id, label) {
      return h("button", { class: "hb-chip", type: "button", "aria-pressed": String(sort === id), onclick: function () { if (sort !== id) { sort = id; load(true); } } }, label);
    }
    function paintTop() {
      top.textContent = "";
      add(top, [chip("new", "Newest"), chip("top", "Top"), h("span", { class: "grow" })]);
      if (me && me.signedIn) {
        add(top, h("span", { class: "hb-me" }, "Signed in as ", h("b", null, "@" + me.user.username)));
        if (me.mod) add(top, h("button", { class: "hb-btn tonal", type: "button", "aria-expanded": String(modOpen), onclick: function () { modOpen = !modOpen; paintTop(); paintMod(); } }, icon("shield"), "Moderation"));
        add(top, h("button", { class: "hb-btn text", type: "button", onclick: signOut }, "Sign out"));
      } else add(top, h("button", { class: "hb-btn", type: "button", onclick: signIn }, icon("login"), "Sign in to post"));
    }
    function paintCompose() {
      compose.textContent = "";
      if (!me || !me.signedIn) { add(compose, h("p", { class: "hb-note" }, "Anyone can read. Sign in with your Ripple or Sonar account to post and reply.")); return; }
      if (me.banned) { add(compose, h("p", { class: "hb-err", role: "alert" }, me.banned.until ? "You can't post here until " + new Date(me.banned.until).toLocaleString() + "." : "You can't post in discussions.", me.banned.reason ? " Reason: " + me.banned.reason : "")); return; }
      if (!me.canPost) { add(compose, h("p", { class: "hb-note" }, "Your account can't post right now.")); return; }
      add(compose, composer(null));
    }
    function composer(parent, onDone) {
      var ta = h("textarea", { maxlength: "1000", placeholder: parent ? "Write a reply…" : "Ask a question or share an idea about " + app + "…", "aria-label": parent ? "Your reply" : "New post about " + app });
      var count = h("span", { class: "hb-note" }, "0 / 1000"), err = h("p", { class: "hb-err", role: "alert" });
      var go = h("button", { class: "hb-btn", type: "submit" }, icon("send"), parent ? "Reply" : "Post");
      ta.addEventListener("input", function () { count.textContent = ta.value.length + " / 1000"; });
      var form = h("form", { class: "hb-compose" }, ta, err, h("div", { class: "hb-row" }, go, count, onDone ? h("button", { class: "hb-btn text", type: "button", onclick: onDone }, "Cancel") : null,
        h("span", { class: "hb-note" }, "Be kind. No spam; at most 2 links.")));
      form.addEventListener("submit", function (e) {
        e.preventDefault(); err.textContent = "";
        var text = ta.value.trim(); if (!text) { err.textContent = "Write something first."; return; }
        go.disabled = true;
        api("/v1/site/discussions/" + name, { body: parent ? { text: text, parentId: parent.id } : { text: text } }).then(function (p) {
          ta.value = ""; count.textContent = "0 / 1000";
          if (parent) { parent.replies = (parent.replies || []).concat(p); parent.replyCount++; if (onDone) onDone(); }
          else { items.unshift(p); }
          paintList(); toast(parent ? "Reply posted" : "Posted");
        }).catch(function (x) { err.textContent = x.message; }).then(function () { go.disabled = false; });
      });
      setTimeout(function () { if (parent) ta.focus(); }, 0);
      return form;
    }

    function act(ic, label, onclick, pressed) {
      return h("button", { class: "hb-act", type: "button", onclick: onclick, "aria-pressed": pressed == null ? null : String(pressed), "aria-label": label.aria || null },
        icon(ic), label.text != null ? label.text : label);
    }
    function postEl(p, parent) {
      var li = h("li", { class: "hb-post" + (p.pinned ? " pinned" : ""), id: "post-" + p.id });
      var head = h("div", { class: "hb-head" }, authorLine(p.author), h("time", { class: "hb-time", datetime: new Date(p.createdAt).toISOString(), title: new Date(p.createdAt).toLocaleString() }, "· " + ago(p.createdAt)),
        p.pinned ? h("span", { class: "hb-flag" }, icon("push_pin", true), "Pinned") : null, p.locked ? h("span", { class: "hb-flag" }, icon("lock", true), "Locked") : null);
      var acts = h("div", { class: "hb-acts" });
      var signed = me && me.signedIn;
      add(acts, act("favorite", { text: String(p.likes || 0), aria: (p.liked ? "Unlike" : "Like") + " (" + (p.likes || 0) + ")" }, function () {
        if (!signed) return signIn();
        api("/v1/site/discussions/posts/" + p.id + "/like", { body: { on: !p.liked } }).then(function (r) { p.likes = r.likes; p.liked = r.liked; paintList(); }).catch(function (x) { toast(x.message); });
      }, !!p.liked));
      var replyBox = h("div");
      if (!parent && (!p.locked || (me && me.mod))) add(acts, act("reply", "Reply", function () {
        if (!signed) return signIn();
        if (!me.canPost) return toast("You can't post right now.");
        replyBox.textContent = ""; add(replyBox, composer(p, function () { replyBox.textContent = ""; }));
      }));
      if (signed && !p.mine) add(acts, act("flag", "Report", function () { report(p); }));
      if (signed && (p.mine || me.mod)) add(acts, act("delete", "Delete", function () {
        if (!confirm(p.mine ? "Delete your post?" : "Delete this post by @" + p.author.username + "? (logged)")) return;
        api("/v1/site/discussions/posts/" + p.id, { method: "DELETE" }).then(function () { removeLocal(p, parent); toast("Deleted"); }).catch(function (x) { toast(x.message); });
      }));
      if (signed && me.mod) {
        if (!parent) {
          add(acts, act("push_pin", p.pinned ? "Unpin" : "Pin", function () { mod(p, p.pinned ? "unpin" : "pin"); }));
          add(acts, act(p.locked ? "lock_open" : "lock", p.locked ? "Unlock" : "Lock", function () { mod(p, p.locked ? "unlock" : "lock"); }));
        }
        if (p.author.id && p.author.id !== me.user.id) add(acts, act("block", "Ban", function () { ban(p.author); }));
      }
      add(li, [head, h("div", { class: "hb-text" }, linkify(p.text)), acts]);
      if (!parent) {
        var rs = p.replies || [];
        if (rs.length) {
          var ul = h("ul", { class: "hb-replies", "aria-label": "Replies" });
          rs.forEach(function (r) { ul.appendChild(postEl(r, p)); });
          li.appendChild(ul);
        }
        if (p.replyCount > rs.length) li.appendChild(h("button", { class: "hb-btn text", type: "button", onclick: function (e) {
          e.target.disabled = true;
          api("/v1/site/discussions/posts/" + p.id + "/replies").then(function (j) { p.replies = j.items || []; p.replyCount = Math.max(p.replyCount, p.replies.length); paintList(); })
            .catch(function (x) { toast(x.message); e.target.disabled = false; });
        } }, "Show " + (p.replyCount - rs.length) + " more " + (p.replyCount - rs.length === 1 ? "reply" : "replies")));
        li.appendChild(replyBox);
      }
      return li;
    }
    function removeLocal(p, parent) {
      if (parent) { parent.replies = parent.replies.filter(function (x) { return x.id !== p.id; }); parent.replyCount = Math.max(0, parent.replyCount - 1); }
      else items = items.filter(function (x) { return x.id !== p.id; });
      paintList();
    }
    function mod(p, action) {
      api("/v1/site/discussions/posts/" + p.id + "/mod", { body: { action: action } }).then(function (r) { p.pinned = r.pinned; p.locked = r.locked; toast("Done (" + action + ")"); load(true); })
        .catch(function (x) { toast(x.message); });
    }
    function paintList() {
      list.textContent = "";
      if (!items.length && !loading) list.appendChild(h("li", { class: "hb-empty" }, "No posts yet. Start the conversation!"));
      items.forEach(function (p) { list.appendChild(postEl(p, null)); });
      more.hidden = !cursor;
    }
    function load(reset) {
      if (loading) return;
      loading = true; status.textContent = reset ? "Loading…" : "Loading more…";
      if (reset) cursor = null;
      api("/v1/site/discussions/" + name + "?sort=" + sort + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "")).then(function (j) {
        me = j.me; items = reset ? j.items : items.concat(j.items); cursor = j.cursor;
        status.textContent = j.total ? j.total + (j.total === 1 ? " post" : " posts") : "";
        setCount(det, j.total);
      }).catch(function (x) { status.textContent = x.message; }).then(function () {
        loading = false; paintTop(); paintCompose(); paintList(); if (modOpen) paintMod();
      });
    }

    // ------------------------------------------------ moderation panel (owner + developer access; the server checks)
    function paintMod() {
      modBox.textContent = "";
      if (!modOpen || !me || !me.mod) return;
      var box = h("section", { class: "hb-mod", "aria-label": "Moderation" }, h("h5", null, icon("flag"), "Open reports"));
      modBox.appendChild(box);
      var reps = h("div", null, h("p", { class: "hb-note" }, "Loading…")), bans = h("div", null, h("p", { class: "hb-note" }, "Loading…"));
      add(box, [reps, h("h5", null, icon("block"), "Discussion bans"), bans,
        h("button", { class: "hb-btn tonal", type: "button", onclick: function () { ban(null); } }, icon("person_off"), "Ban someone…")]);
      api("/v1/site/discussions/mod/reports").then(function (j) {
        reps.textContent = "";
        var mine = (j.items || []).filter(function (r) { return r.post.board === name; });
        if (!mine.length) reps.appendChild(h("p", { class: "hb-note" }, "Nothing reported in " + app + "."));
        mine.forEach(function (r) {
          var reasons = r.reports.map(function (x) { return x.reason + (x.reporter ? " (@" + x.reporter + ")" : ""); }).join(", ");
          reps.appendChild(h("div", { class: "item" }, h("div", { class: "hb-head" }, authorLine(r.post.author), r.post.removed ? h("span", { class: "hb-flag" }, "Removed") : null),
            h("div", null, r.post.text), h("p", { class: "hb-note" }, r.count + (r.count === 1 ? " report: " : " reports: ") + reasons),
            h("div", { class: "hb-row" },
              h("button", { class: "hb-btn", type: "button", onclick: function () { modAction(r.post.id, "delete").then(function () { decide(r.post.id, "resolved"); }); } }, icon("delete"), "Delete post"),
              h("button", { class: "hb-btn tonal", type: "button", onclick: function () { decide(r.post.id, "dismissed"); } }, "Dismiss"),
              r.post.author.id ? h("button", { class: "hb-btn text", type: "button", onclick: function () { ban(r.post.author); } }, "Ban author") : null)));
        });
      }).catch(function (x) { reps.textContent = x.message; });
      api("/v1/site/discussions/mod/bans").then(function (j) {
        bans.textContent = "";
        if (!(j.items || []).length) bans.appendChild(h("p", { class: "hb-note" }, "Nobody is banned."));
        (j.items || []).forEach(function (b) {
          bans.appendChild(h("div", { class: "item" }, h("div", { class: "hb-head" }, authorLine(b.user)),
            h("p", { class: "hb-note" }, (b.until ? "Until " + new Date(b.until).toLocaleString() : "Until lifted") + (b.reason ? " · " + b.reason : "") + (b.by ? " · by @" + b.by : "")),
            h("div", { class: "hb-row" }, h("button", { class: "hb-btn tonal", type: "button", onclick: function () {
              api("/v1/site/discussions/mod/bans/" + encodeURIComponent(b.user.id), { method: "DELETE" }).then(function () { toast("Ban lifted"); paintMod(); }).catch(function (x) { toast(x.message); });
            } }, "Lift ban"))));
        });
      }).catch(function (x) { bans.textContent = x.message; });
    }
    function modAction(id, action) { return api("/v1/site/discussions/posts/" + id + "/mod", { body: { action: action } }).catch(function (x) { toast(x.message); throw x; }); }
    function decide(id, st) { api("/v1/site/discussions/mod/reports/" + id, { body: { status: st } }).then(function () { toast(st === "dismissed" ? "Reports dismissed" : "Post removed"); paintMod(); load(true); }).catch(function (x) { toast(x.message); }); }
    function ban(author) {
      var user = h("input", { placeholder: "Username", value: author ? author.username : "", "aria-label": "Username", autocapitalize: "none", spellcheck: "false", required: true });
      var days = h("select", { "aria-label": "How long" }, [["1", "1 day"], ["7", "7 days"], ["30", "30 days"], ["365", "1 year"], ["0", "Until lifted"]].map(function (o) { return h("option", { value: o[0] }, o[1]); }));
      var reason = h("input", { placeholder: "Reason (shown to them)", maxlength: "200", "aria-label": "Reason" });
      var purge = h("input", { type: "checkbox", id: "hb-purge" });
      dialog("Ban from discussions", [user, days, reason, h("label", { class: "hb-row hb-note", for: "hb-purge" }, purge, "Also remove their posts from the last 7 days")], "Ban", function () {
        return api("/v1/site/discussions/mod/bans", { body: { username: user.value.trim(), days: Number(days.value), reason: reason.value.trim(), purge: purge.checked } })
          .then(function () { toast("Banned @" + user.value.trim().replace(/^@/, "")); load(true); });
      });
    }
    function report(p) {
      var why = h("select", { "aria-label": "Reason" }, [["spam", "Spam"], ["harassment", "Harassment or bullying"], ["hate", "Hate"], ["sexual", "Sexual content"], ["violence", "Violence or threats"], ["other", "Something else"]]
        .map(function (o) { return h("option", { value: o[0] }, o[1]); }));
      var details = h("input", { placeholder: "Anything else? (optional)", maxlength: "300", "aria-label": "Details" });
      dialog("Report this post", [h("p", { class: "hb-note" }, "Moderators will take a look. The author isn't told who reported it."), why, details], "Report", function () {
        return api("/v1/site/discussions/posts/" + p.id + "/report", { body: { reason: why.value, details: details.value.trim() } }).then(function () { toast("Thanks — reported"); });
      });
    }
    function signOut() {
      api("/v1/auth/logout", { body: {} }).catch(function () {}).then(function () { setToken(null); toast("Signed out"); });
    }
    var board = { reload: function () { me = null; items = []; if (det.open) load(true); }, open: function () { if (!me) load(true); } };
    return board;
  }
  function setCount(det, n) {
    var c = det.querySelector("summary .count");
    if (c) c.textContent = n ? "· " + n + (n === 1 ? " post" : " posts") : "";
  }

  // ---------------------------------------------------------------- dialogs
  function dialog(title, fields, okLabel, onOk) {
    var err = h("p", { class: "hb-err", role: "alert" });
    var ok = h("button", { class: "hb-btn", type: "submit" }, okLabel);
    var dlg = h("dialog", { class: "hb-dlg", "aria-label": title });
    var form = h("form", { method: "dialog" }, h("h3", null, title), fields, err,
      h("div", { class: "hb-row" }, h("button", { class: "hb-btn text", type: "button", onclick: function () { dlg.close(); } }, "Cancel"), ok));
    form.addEventListener("submit", function (e) {
      e.preventDefault(); err.textContent = ""; ok.disabled = true;
      Promise.resolve().then(onOk).then(function () { dlg.close(); }).catch(function (x) { err.textContent = x.message; }).then(function () { ok.disabled = false; });
    });
    dlg.appendChild(form);
    dlg.addEventListener("close", function () { dlg.remove(); });
    d.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    var f = dlg.querySelector("input,select,textarea"); if (f) f.focus();
    return dlg;
  }
  function signIn() {
    var un = h("input", { placeholder: "Username", autocomplete: "username", "aria-label": "Username", autocapitalize: "none", spellcheck: "false" });
    var pw = h("input", { placeholder: "Password", type: "password", autocomplete: "current-password", "aria-label": "Password" });
    dialog("Sign in", [h("p", { class: "hb-note" }, "Use your Ripple or Sonar username and password — it's the same account."), un, pw,
      h("p", { class: "hb-note" }, "New here? ", h("a", { href: SONAR_WEB, target: "_blank", rel: "noopener" }, "Create a free account"), " · ",
        h("a", { href: SONAR_WEB, target: "_blank", rel: "noopener" }, "Forgot password?"))], "Sign in", function () {
      var u = un.value.trim().replace(/^@/, "");
      if (u.indexOf("@") >= 0) throw new Error("Use your Ripple username (no @).");
      if (!u || !pw.value) throw new Error("Enter your username and password.");
      if (!window.crypto || !crypto.subtle) throw new Error("This browser can't sign in securely (needs HTTPS).");
      return passwordHash(u, pw.value).then(function (ph) { return api("/v1/auth/login", { body: { username: u, passwordHash: ph }, auth: false }); })
        .then(function (j) { setToken(j.token); toast("Signed in as @" + j.user.username); });
    });
  }

  // ---------------------------------------------------------------- wire up
  function openFromHash() {
    var m = /^#([a-z]+)-discussion$/.exec(location.hash); if (!m) return;
    var det = d.getElementById(m[1] + "-discussion");
    if (det && !det.open) { det.open = true; }
    if (det) setTimeout(function () { det.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }, 60);
  }
  d.querySelectorAll("details.disc[data-board]").forEach(function (det) {
    var b = Board(det); boards.push(b);
    var card = det.closest(".card");
    function sync() { if (card) card.classList.toggle("wide", det.open); if (det.open) b.open(); }
    det.addEventListener("toggle", sync); sync();
  });
  api("/v1/site/discussions", { auth: false }).then(function (j) {
    d.querySelectorAll("details.disc[data-board]").forEach(function (det) { var x = j.boards && j.boards[det.getAttribute("data-board")]; if (x) setCount(det, x.posts); });
  }).catch(function () {});
  addEventListener("hashchange", openFromHash);
  openFromHash();
  showBeacons();
})();
