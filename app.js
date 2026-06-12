"use strict";

/*
 * Chirp — シンプルなつぶやきSNS
 * Supabase Auth（メール+パスワード）と posts テーブルを使った最小構成。
 */

// ---- Supabase クライアントの初期化 -------------------------------------
const cfg = window.SUPABASE_CONFIG || {};
const configured =
  cfg.url &&
  cfg.anonKey &&
  !cfg.url.includes("YOUR_") &&
  !cfg.anonKey.includes("YOUR_");

let supabase = null;
if (configured) {
  supabase = window.supabase.createClient(cfg.url, cfg.anonKey);
}

// ---- 要素参照 -----------------------------------------------------------
const el = (id) => document.getElementById(id);
const authView = el("authView");
const appView = el("appView");
const userArea = el("userArea");
const userName = el("userName");

const authForm = el("authForm");
const authTitle = el("authTitle");
const authSubmit = el("authSubmit");
const authMessage = el("authMessage");
const usernameField = el("usernameField");
const toggleText = el("toggleText");
const toggleLink = el("toggleLink");

const postInput = el("postInput");
const postBtn = el("postBtn");
const charCount = el("charCount");
const timeline = el("timeline");

let isSignupMode = false;
let currentUser = null;
let realtimeChannel = null;

// ---- 設定未完了時のガード ----------------------------------------------
if (!configured) {
  document.querySelector(".container").insertAdjacentHTML(
    "afterbegin",
    `<div class="config-warning">
      ⚠️ Supabase の接続情報が設定されていません。<br />
      <code>config.example.js</code> を <code>config.js</code> にコピーし、
      プロジェクトの URL と publishable key を設定してください。
    </div>`
  );
} else {
  init();
}

// ---- 初期化 -------------------------------------------------------------
async function init() {
  const { data } = await supabase.auth.getSession();
  applySession(data.session);

  supabase.auth.onAuthStateChange((_event, session) => {
    applySession(session);
  });

  wireAuthForm();
  wireComposer();
}

function applySession(session) {
  currentUser = session?.user || null;
  if (currentUser) {
    showApp();
  } else {
    showAuth();
  }
}

// ---- 画面切り替え -------------------------------------------------------
function showAuth() {
  authView.classList.remove("hidden");
  appView.classList.add("hidden");
  userArea.classList.add("hidden");
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

function showApp() {
  authView.classList.add("hidden");
  appView.classList.remove("hidden");
  userArea.classList.remove("hidden");
  userName.textContent = "@" + displayName(currentUser);
  loadPosts();
  subscribeRealtime();
}

function displayName(user) {
  return (
    user?.user_metadata?.username ||
    (user?.email ? user.email.split("@")[0] : "user")
  );
}

// ---- 認証フォーム -------------------------------------------------------
function wireAuthForm() {
  toggleLink.addEventListener("click", (e) => {
    e.preventDefault();
    isSignupMode = !isSignupMode;
    setAuthMode();
  });

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = el("email").value.trim();
    const password = el("password").value;
    const username = el("username").value.trim();

    setMessage("", "");
    authSubmit.disabled = true;

    try {
      if (isSignupMode) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username || email.split("@")[0] } },
        });
        if (error) throw error;
        // メール確認が必要な場合 session は null になる
        if (data.session) {
          setMessage("登録が完了しました！", "success");
        } else {
          setMessage(
            "確認メールを送信しました。メール内のリンクをクリックして認証を完了してください。",
            "success"
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err) {
      setMessage(translateError(err.message), "error");
    } finally {
      authSubmit.disabled = false;
    }
  });

  el("logoutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  setAuthMode();
}

function setAuthMode() {
  authMessage.textContent = "";
  if (isSignupMode) {
    authTitle.textContent = "新規登録";
    authSubmit.textContent = "登録する";
    usernameField.classList.remove("hidden");
    toggleText.textContent = "すでにアカウントをお持ちですか？";
    toggleLink.textContent = "ログイン";
  } else {
    authTitle.textContent = "ログイン";
    authSubmit.textContent = "ログイン";
    usernameField.classList.add("hidden");
    toggleText.textContent = "アカウントをお持ちでないですか？";
    toggleLink.textContent = "新規登録";
  }
}

function setMessage(text, type) {
  authMessage.textContent = text;
  authMessage.className = "auth-message" + (type ? " " + type : "");
}

function translateError(msg) {
  if (/Invalid login credentials/i.test(msg))
    return "メールアドレスまたはパスワードが正しくありません。";
  if (/already registered/i.test(msg))
    return "このメールアドレスは既に登録されています。";
  if (/Email not confirmed/i.test(msg))
    return "メールアドレスが未確認です。確認メールのリンクをクリックしてください。";
  if (/Password should be at least/i.test(msg))
    return "パスワードは6文字以上にしてください。";
  return msg;
}

// ---- 投稿（つぶやき） ---------------------------------------------------
function wireComposer() {
  postInput.addEventListener("input", () => {
    const remaining = 280 - postInput.value.length;
    charCount.textContent = remaining;
    charCount.classList.toggle("warn", remaining < 20);
  });

  postBtn.addEventListener("click", submitPost);
}

async function submitPost() {
  const content = postInput.value.trim();
  if (!content) return;

  postBtn.disabled = true;
  const { error } = await supabase.from("posts").insert({
    user_id: currentUser.id,
    author: displayName(currentUser),
    content,
  });
  postBtn.disabled = false;

  if (error) {
    alert("投稿に失敗しました: " + error.message);
    return;
  }

  postInput.value = "";
  charCount.textContent = "280";
  charCount.classList.remove("warn");
  // リアルタイムが無効でも反映されるよう再読み込み
  loadPosts();
}

// ---- タイムライン -------------------------------------------------------
async function loadPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    timeline.innerHTML = `<p class="empty-state">読み込みに失敗しました。</p>`;
    return;
  }
  renderPosts(data || []);
}

function renderPosts(posts) {
  if (posts.length === 0) {
    timeline.innerHTML = `<p class="empty-state">まだつぶやきがありません。最初の一言を！</p>`;
    return;
  }
  timeline.innerHTML = posts.map(postHtml).join("");

  timeline.querySelectorAll(".post-delete").forEach((btn) => {
    btn.addEventListener("click", () => deletePost(btn.dataset.id));
  });
}

function postHtml(p) {
  const mine = currentUser && p.user_id === currentUser.id;
  return `
    <article class="post">
      <div class="post-header">
        <span class="post-author">@${escapeHtml(p.author)}</span>
        <span class="post-time">${formatTime(p.created_at)}</span>
      </div>
      <div class="post-content">${escapeHtml(p.content)}</div>
      ${
        mine
          ? `<div style="text-align:right;margin-top:6px;">
               <button class="post-delete" data-id="${p.id}">削除</button>
             </div>`
          : ""
      }
    </article>`;
}

async function deletePost(id) {
  if (!confirm("このつぶやきを削除しますか？")) return;
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) {
    alert("削除に失敗しました: " + error.message);
    return;
  }
  loadPosts();
}

// ---- リアルタイム購読 ---------------------------------------------------
function subscribeRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = supabase
    .channel("posts-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "posts" },
      () => loadPosts()
    )
    .subscribe();
}

// ---- ユーティリティ -----------------------------------------------------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "たった今";
  if (diff < 3600) return Math.floor(diff / 60) + "分前";
  if (diff < 86400) return Math.floor(diff / 3600) + "時間前";
  return d.toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
