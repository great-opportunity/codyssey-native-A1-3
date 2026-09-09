document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  let activeTab = 'text';

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      tabButtons.forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== activeTab));
      clearError();
    });
  });

  const txtFileInput = document.getElementById('txtFile');
  const txtFileName = document.getElementById('txtFileName');
  txtFileInput.addEventListener('change', () => {
    txtFileName.textContent = txtFileInput.files[0] ? txtFileInput.files[0].name : '';
  });

  const audioFileInput = document.getElementById('audioFile');
  const audioFileName = document.getElementById('audioFileName');
  audioFileInput.addEventListener('change', () => {
    audioFileName.textContent = audioFileInput.files[0] ? audioFileInput.files[0].name : '';
  });

  const analyzeBtn = document.getElementById('analyzeBtn');
  const statusMsg = document.getElementById('statusMsg');
  const errorBox = document.getElementById('errorBox');
  const resultBox = document.getElementById('resultBox');
  const resultSummary = document.getElementById('resultSummary');
  const resultList = document.getElementById('resultList');
  const patternSection = document.getElementById('patternSection');
  const patternList = document.getElementById('patternList');

  const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
  const REQUEST_TIMEOUT_MS = 280000;
  let elapsedTimer = null;

  function clearError() {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  }

  function setLoading(isLoading, label) {
    analyzeBtn.disabled = isLoading;
    clearInterval(elapsedTimer);

    if (!isLoading) {
      statusMsg.innerHTML = '';
      return;
    }

    const text = label || '분석 중';
    const started = Date.now();
    const render = () => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      statusMsg.innerHTML =
        '<span class="spinner" aria-hidden="true"></span>' +
        escapeHtml(text) + ' ' + seconds + '초' +
        (seconds >= 20 ? ' <span class="status-hint">· 긴 대화는 1분 이상 걸릴 수 있어요</span>' : '');
    };
    render();
    elapsedTimer = setInterval(render, 1000);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        resolve(result.split(',')[1] || '');
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  async function safeJson(res) {
    try {
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function renderResults(data) {
    resultSummary.textContent = data.summary || '';

    patternList.innerHTML = '';
    if (data.patterns && data.patterns.length > 0) {
      data.patterns.forEach((pattern) => {
        const card = document.createElement('div');
        card.className = 'pattern-card';
        const count = Number(pattern.count);
        const countLabel = count > 0 ? '<span class="pattern-count">' + count + '회</span>' : '';
        card.innerHTML =
          '<p class="pattern-label">' + escapeHtml(pattern.label) + countLabel + '</p>' +
          '<p class="pattern-advice">' + escapeHtml(pattern.advice) + '</p>';
        patternList.appendChild(card);
      });
      patternSection.classList.remove('hidden');
    } else {
      patternSection.classList.add('hidden');
    }

    resultList.innerHTML = '';

    if (!data.items || data.items.length === 0) {
      resultList.innerHTML = '<p class="empty-result">어색한 문장을 찾지 못했어요. 아주 잘 말씀하셨네요!</p>';
    } else {
      data.items.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML =
          '<p class="result-original">"' + escapeHtml(item.original) + '"</p>' +
          '<p class="result-suggestion">→ ' + escapeHtml(item.suggestion) + '</p>' +
          '<p class="result-reason">' + escapeHtml(item.reason) + '</p>';
        resultList.appendChild(card);
      });
    }

    resultBox.classList.remove('hidden');
  }

  async function runAnalyze(transcript) {
    setLoading(true, '분석 중');
    let res;
    try {
      res = await fetchWithTimeout(
        '/api',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'analyze', transcript }),
        },
        REQUEST_TIMEOUT_MS
      );
    } catch (e) {
      setLoading(false);
      showError('응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.');
      return;
    }

    setLoading(false);

    if (!res.ok) {
      const err = await safeJson(res);
      showError((err && err.error) || ('분석 중 오류가 발생했어요. (' + res.status + ')'));
      return;
    }

    const data = await res.json();
    renderResults(data);
  }

  analyzeBtn.addEventListener('click', async () => {
    clearError();
    resultBox.classList.add('hidden');

    try {
      if (activeTab === 'text') {
        const text = document.getElementById('transcriptInput').value.trim();
        if (!text) {
          showError('분석할 텍스트를 입력해주세요.');
          return;
        }
        await runAnalyze(text);
      } else if (activeTab === 'txt') {
        const file = txtFileInput.files[0];
        if (!file) {
          showError('txt 파일을 선택해주세요.');
          return;
        }
        const text = await readFileAsText(file);
        if (!text.trim()) {
          showError('파일 내용이 비어있어요.');
          return;
        }
        await runAnalyze(text);
      } else if (activeTab === 'audio') {
        const file = audioFileInput.files[0];
        if (!file) {
          showError('mp3 파일을 선택해주세요.');
          return;
        }
        if (file.size > MAX_AUDIO_BYTES) {
          showError('파일이 너무 커요(3MB 이하만 지원). 다른 도구로 텍스트 변환 후 txt로 업로드해주세요.');
          return;
        }

        setLoading(true, '음성 전사 중');
        const base64 = await readFileAsBase64(file);

        let transcribeRes;
        try {
          transcribeRes = await fetchWithTimeout(
            '/api',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'transcribe', audio_base64: base64, filename: file.name }),
            },
            REQUEST_TIMEOUT_MS
          );
        } catch (e) {
          setLoading(false);
          showError('전사 요청이 너무 오래 걸려요. 다시 시도하거나 txt로 업로드해주세요.');
          return;
        }

        if (!transcribeRes.ok) {
          const err = await safeJson(transcribeRes);
          setLoading(false);
          showError((err && err.error) || '음성 전사 중 오류가 발생했어요.');
          return;
        }

        const transcribeData = await transcribeRes.json();
        setLoading(false);
        await runAnalyze(transcribeData.transcript);
      }
    } catch (e) {
      setLoading(false);
      showError('예상치 못한 오류가 발생했어요. 다시 시도해주세요.');
    }
  });
});
