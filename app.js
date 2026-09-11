// デプロイ済みのCloudflare Worker
const WORKER_URL = "https://youtube-hashtag-finder.hitoiki4105.workers.dev";

const keywordInput = document.getElementById("keyword");
const countSlider = document.getElementById("count");
const countValue = document.getElementById("countValue");
const runBtn = document.getElementById("runBtn");
const quotaNote = document.getElementById("quotaNote");

const statusArea = document.getElementById("statusArea");
const statusText = document.getElementById("statusText");

const resultsArea = document.getElementById("resultsArea");
const resultsHeading = document.getElementById("resultsHeading");
const resultsSub = document.getElementById("resultsSub");
const taglist = document.getElementById("taglist");
const videolist = document.getElementById("videolist");
const videoCountEl = document.getElementById("videoCount");

const errorArea = document.getElementById("errorArea");
const errorText = document.getElementById("errorText");
const remainingQuotaEl = document.getElementById("remainingQuota");

const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

const DAILY_QUOTA = 10000;
const QUOTA_STORAGE_KEY = "yt-hashtag-tool-quota-usage";
const HISTORY_STORAGE_KEY = "yt-hashtag-tool-history";
const HISTORY_MAX = 30;

// クォータは太平洋時間の深夜にリセットされるため、その日付をキーにする
function pacificDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // 例: "2026-09-11"
}

function getUsedUnitsToday() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUOTA_STORAGE_KEY) || "{}");
    return raw.date === pacificDateKey() ? raw.used : 0;
  } catch {
    return 0;
  }
}

function addUsedUnits(units) {
  const used = getUsedUnitsToday() + units;
  localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify({ date: pacificDateKey(), used }));
  return used;
}

function unitsFor(y) {
  const pages = Math.ceil(y / 50);
  // search.list: 100 unit/回, videos.list: 1 unit/回(50件まとめて)
  return { pages, units: pages * 100 + pages };
}

function renderRemainingQuota() {
  const used = getUsedUnitsToday();
  const remaining = Math.max(0, DAILY_QUOTA - used);
  remainingQuotaEl.textContent =
    `本日の残りのクォータ(このツールでの利用分から概算):約 ${remaining} / ${DAILY_QUOTA} ユニット`;
}

function updateCountLabel() {
  const y = Number(countSlider.value);
  countValue.innerHTML = `${y}<span class="unit">件</span>`;
  const { pages, units } = unitsFor(y);
  quotaNote.textContent = `想定クォータ消費:約 ${units} ユニット(search.list ${pages}回 + videos.list ${pages}回)`;
  renderRemainingQuota();
}
countSlider.addEventListener("input", updateCountLabel);
updateCountLabel();

// ---------- 検索語の履歴(ブラウザのlocalStorageに保存。閉じても残る) ----------

function loadHistory() {
  try {
    const arr = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveHistory(arr) {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(arr));
}

function addToHistory(keyword) {
  const now = Date.now();
  let history = loadHistory().filter((h) => h.keyword !== keyword);
  history.unshift({ keyword, ts: now });
  history = history.slice(0, HISTORY_MAX);
  saveHistory(history);
  renderHistory();
}

function formatTs(ts) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(ts));
}

function renderHistory() {
  const history = loadHistory();
  historyList.querySelectorAll(".history__item").forEach((el) => el.remove());
  historyEmpty.hidden = history.length > 0;

  history.forEach((entry) => {
    const li = document.createElement("li");
    li.className = "history__item";
    li.tabIndex = 0;
    li.innerHTML = `<span>${escapeHtml(entry.keyword)}</span><span class="ts">${formatTs(entry.ts)}</span>`;
    li.addEventListener("click", () => {
      keywordInput.value = entry.keyword;
      keywordInput.focus();
    });
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        li.click();
      }
    });
    historyList.appendChild(li);
  });
}

clearHistoryBtn.addEventListener("click", () => {
  if (!confirm("検索語の履歴を消去しますか?")) return;
  saveHistory([]);
  renderHistory();
});

renderHistory();

function setBusy(isBusy) {
  runBtn.disabled = isBusy;
  statusArea.hidden = !isBusy;
}

function showError(message) {
  errorText.textContent = message;
  errorArea.hidden = false;
}

function hideAllResultAreas() {
  errorArea.hidden = true;
  resultsArea.hidden = true;
}

async function runSearch() {
  const keyword = keywordInput.value.trim();
  const count = Number(countSlider.value);

  if (!keyword) {
    showError("検索語 X を入力してください。");
    keywordInput.focus();
    return;
  }

  if (WORKER_URL.includes("your-worker-name")) {
    showError("app.js の WORKER_URL がまだ設定されていません。デプロイしたCloudflare WorkerのURLに書き換えてください。");
    return;
  }

  hideAllResultAreas();
  setBusy(true);
  statusText.textContent = `「${keyword}」で上位 ${count} 件を取得中…`;

  try {
    const url = `${WORKER_URL}/api/hashtags?q=${encodeURIComponent(keyword)}&count=${count}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `サーバーエラー(status ${res.status})`);
    }

    const data = await res.json();
    renderResults(keyword, data);

    addUsedUnits(unitsFor(count).units);
    renderRemainingQuota();
    addToHistory(keyword);
  } catch (err) {
    showError(`取得に失敗しました:${err.message}`);
  } finally {
    setBusy(false);
  }
}

function renderResults(keyword, data) {
  const { videos, hashtags, requestedCount } = data;

  resultsHeading.textContent = "共起ハッシュタグ";
  document.getElementById("resultsExplain").textContent =
    `検索語【${keyword}】で表示される上位の動画の動画詳細欄、タイトルから取得した共起ハッシュタグを表示します。`;
  resultsSub.textContent = `動画 ${videos.length} 件(要求 ${requestedCount} 件)から ${hashtags.length} 種類のハッシュタグを検出`;

  taglist.innerHTML = "";
  const maxCount = hashtags.length ? hashtags[0].count : 1;

  if (hashtags.length === 0) {
    const li = document.createElement("li");
    li.textContent = "ハッシュタグは見つかりませんでした。";
    li.style.border = "none";
    taglist.appendChild(li);
  }

  hashtags.forEach((item, i) => {
    const li = document.createElement("li");
    const pct = Math.max(4, Math.round((item.count / maxCount) * 100));
    li.innerHTML = `
      <span class="rank">${String(i + 1).padStart(2, "0")}</span>
      <span class="tagname">#${escapeHtml(item.tag)}</span>
      <span class="barwrap">
        <span class="bar"><span style="width:${pct}%"></span></span>
        <span class="count">${item.count}</span>
      </span>
    `;
    taglist.appendChild(li);
  });

  videolist.innerHTML = "";
  videoCountEl.textContent = videos.length;
  videos.forEach((v) => {
    const li = document.createElement("li");
    const tagsText = v.tags.length ? v.tags.map((t) => "#" + t).join(" ") : "(ハッシュタグなし)";
    li.innerHTML = `
      <a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">${escapeHtml(v.title)}</a>
      <span class="vidtags">${escapeHtml(tagsText)}</span>
    `;
    videolist.appendChild(li);
  });

  resultsArea.hidden = false;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

runBtn.addEventListener("click", runSearch);
keywordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});
