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
  const transcriptSection = document.getElementById('transcriptSection');
  const transcriptBody = document.getElementById('transcriptBody');
  const transcriptMeta = document.getElementById('transcriptMeta');
  const copyTranscriptBtn = document.getElementById('copyTranscript');

  // Vercel 함수 본문 상한(4.5MB)보다 조금 낮게 잡는다.
  const MAX_UPLOAD_BYTES = 4200000;
  /*
   * 조각 하나의 전사가 함수 실행 시간 제한(5분) 안에 끝나야 한다.
   * 실제 수업 녹음은 겹쳐 말하기와 잡음 때문에 합성 음성보다 훨씬 느리게
   * 처리된다(4분 분량이 4분 넘게 걸렸다). 짧게 끊어 여유를 둔다.
   */
  const AUDIO_CHUNK_SECONDS = 150;
  // 서버가 300초까지 붙잡을 수 있으므로 그보다 늦게 포기해야 한다.
  const REQUEST_TIMEOUT_MS = 320000;
  let elapsedTimer = null;
  let lastTranscript = '';

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
        (seconds >= 20
          ? ' <span class="status-hint">· 20분 녹음은 5분 안팎 걸려요. 창을 닫지 말고 기다려주세요</span>'
          : '');
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

  /*
   * 받아쓴 대화를 그대로 보여준다. '[00:12] A: ...' 형태면 시각과 화자를 떼어
   * 읽기 좋게 배치하고, 그런 형식이 아니면 원문을 그대로 둔다.
   */
  function renderTranscript(text, speakerRoles) {
    transcriptBody.innerHTML = '';
    lastTranscript = text;

    const roles = speakerRoles || {};
    const lines = text.split('\n').filter((line) => line.trim());
    const fallbackColors = {};
    let nextColor = 0;

    lines.forEach((line) => {
      const row = document.createElement('div');
      row.className = 'transcript-line';

      const match = line.match(/^\[(\d+:\d{2})\]\s*([^:]{1,20}):\s*(.*)$/);
      if (match) {
        const symbol = match[2];
        const role = roles[symbol];

        // 화자 기호는 조각마다 새로 매겨지고 한 사람이 여러 기호로 갈리기도 해서
        // 그대로 보여주면 혼란스럽다. 분석이 판정한 역할이 있으면 그것을 쓴다.
        let label = symbol;
        let colorClass;
        if (role === 'me') {
          label = '나';
          colorClass = 'speaker-me';
        } else if (role === 'tutor') {
          label = '튜터';
          colorClass = 'speaker-tutor';
        } else {
          if (!(symbol in fallbackColors)) {
            fallbackColors[symbol] = nextColor % 2;
            nextColor += 1;
          }
          colorClass = 'speaker-' + fallbackColors[symbol];
        }

        row.innerHTML =
          '<span class="transcript-time">' + escapeHtml(match[1]) + '</span>' +
          '<span class="transcript-speaker ' + colorClass + '">' + escapeHtml(label) + '</span>' +
          '<span class="transcript-text">' + escapeHtml(match[3]) + '</span>';
      } else {
        row.innerHTML = '<span class="transcript-text">' + escapeHtml(line) + '</span>';
      }

      transcriptBody.appendChild(row);
    });

    transcriptMeta.textContent = lines.length + '줄';
    transcriptSection.open = false;
    transcriptSection.classList.remove('hidden');
  }

  if (copyTranscriptBtn) {
    copyTranscriptBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(lastTranscript);
        copyTranscriptBtn.textContent = '복사했어요';
      } catch (e) {
        copyTranscriptBtn.textContent = '복사하지 못했어요';
      }
      setTimeout(() => {
        copyTranscriptBtn.textContent = '복사하기';
      }, 2000);
    });
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
        const stamp = (item.timestamp || '').trim();
        const stampBadge = stamp ? '<span class="result-time">' + escapeHtml(stamp) + '</span>' : '';
        card.innerHTML =
          stampBadge +
          '<p class="result-original">"' + escapeHtml(item.original) + '"</p>' +
          '<p class="result-suggestion">→ ' + escapeHtml(item.suggestion) + '</p>' +
          '<p class="result-reason">' + escapeHtml(item.reason) + '</p>';
        resultList.appendChild(card);
      });
    }

    resultBox.classList.remove('hidden');
  }

  async function transcribeChunk(chunk) {
    const started = Date.now();
    const res = await fetchWithTimeout(
      '/api?action=transcribe&offset=' + chunk.startSeconds,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: chunk.blob,
      },
      REQUEST_TIMEOUT_MS
    );

    console.log(
      '[transcribe] ' + chunk.startSeconds + 's 지점 조각: ' +
      Math.round((Date.now() - started) / 1000) + '초 소요, 상태 ' + res.status
    );

    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error((err && err.error) || '음성 전사 중 오류가 발생했어요.');
    }

    const data = await res.json();
    return { startSeconds: chunk.startSeconds, text: (data.transcript || '').trim() };
  }

  async function runAudioFlow(file) {
    let prepared;
    try {
      prepared = await AudioCompressor.compressToChunks(file, {
        maxBytes: MAX_UPLOAD_BYTES,
        chunkSeconds: AUDIO_CHUNK_SECONDS,
        onStage: (stage, info) => {
          if (stage === 'decode') {
            setLoading(true, '녹음 파일 읽는 중');
          } else {
            setLoading(true, '업로드 준비 중 ' + info.index + '/' + info.total);
          }
        },
      });
    } catch (e) {
      setLoading(false);
      showError(e.message || '녹음 파일을 변환하지 못했어요. 다른 파일로 시도해주세요.');
      return;
    }

    const chunks = prepared.chunks;
    let done = 0;
    const describe = () =>
      chunks.length > 1
        ? '화자 나눠서 받아쓰는 중 ' + done + '/' + chunks.length
        : '화자 나눠서 받아쓰는 중';

    setLoading(true, describe());

    // 조각을 동시에 보내야 긴 녹음도 기다릴 만한 시간에 끝난다.
    // 한 조각이 실패해도 나머지로 분석할 수 있게 개별 결과를 따로 받는다.
    const settled = await Promise.allSettled(
      chunks.map((chunk) =>
        transcribeChunk(chunk).then((result) => {
          done += 1;
          setLoading(true, describe());
          return result;
        })
      )
    );

    const succeeded = settled
      .filter((s) => s.status === 'fulfilled')
      .map((s) => s.value)
      .sort((a, b) => a.startSeconds - b.startSeconds);

    const failedCount = settled.length - succeeded.length;
    const transcript = succeeded
      .filter((r) => r.text)
      .map((r) => r.text)
      .join('\n');

    if (!transcript) {
      setLoading(false);
      const reason = settled.find((s) => s.status === 'rejected');
      showError(
        (reason && reason.reason && reason.reason.message) ||
          '받아쓴 내용이 없어요. 녹음 상태를 확인하거나 텍스트로 붙여넣어 주세요.'
      );
      return;
    }

    if (failedCount > 0) {
      showError(
        '녹음 중 ' + failedCount + '개 구간을 받아쓰지 못했어요. 나머지 부분만으로 분석할게요.'
      );
    }

    await runAnalyze(transcript, true);
  }

  async function runAnalyze(transcript, showTranscript) {
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

    // 화면에서 원문을 확인할 수 없는 경로(파일 업로드)에서만 전체 대화를 보여준다.
    if (showTranscript) {
      renderTranscript(transcript, data.speakers);
    }
  }

  analyzeBtn.addEventListener('click', async () => {
    clearError();
    resultBox.classList.add('hidden');
    transcriptSection.classList.add('hidden');

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
        await runAnalyze(text, true);
      } else if (activeTab === 'audio') {
        const file = audioFileInput.files[0];
        if (!file) {
          showError('녹음 파일을 선택해주세요.');
          return;
        }
        await runAudioFlow(file);
      }
    } catch (e) {
      setLoading(false);
      showError('예상치 못한 오류가 발생했어요. 다시 시도해주세요.');
    }
  });
});
