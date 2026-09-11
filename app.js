// ここをデプロイしたCloudflare WorkerのURLに書き換えてください
// 例）"https://youtube-hashtag-tool.your-subdomain.workers.dev"
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

function updateCountLabel() {
  const y = Number(countSlider.value);
  countValue.innerHTML = `${y}<span class="unit">件</span>`;
  const pages = Math.ceil(y / 50);
  // search.list: 100 unit/回, videos.list: 1 unit/回(50件まとめて)
  const units = pages * 100 + pages;
  quotaNote.textContent = `想定クォータ消費:約 ${units} ユニット(search.list ${pages}回 + videos.list ${pages}回)`;
}
countSlider.addEventListener("input", updateCountLabel);
updateCountLabel();

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
  } catch (err) {
    showError(`取得に失敗しました:${err.message}`);
  } finally {
    setBusy(false);
  }
}

function renderResults(keyword, data) {
  const { videos, hashtags, requestedCount } = data;

  resultsHeading.textContent = `「${keyword}」の共起ハッシュタグ`;
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
