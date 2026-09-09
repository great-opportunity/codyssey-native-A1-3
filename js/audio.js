/*
 * 수업 녹음 파일을 서버로 보낼 수 있는 크기까지 줄인다.
 *
 * Vercel 함수는 요청 본문을 4.5MB까지만 받는데 20분짜리 m4a는 보통 그 몇 배다.
 * 음성 인식은 16kHz 모노면 충분하므로, 브라우저에서 미리 그 수준으로 낮춰
 * mp3로 다시 인코딩한다. 20분 기준 약 3~4MB로 줄어든다.
 */
(function (global) {
  const TARGET_SAMPLE_RATE = 16000;
  const DEFAULT_BITRATE_KBPS = 24;
  const SAMPLES_PER_CHUNK = 1152; // MP3 프레임 하나에 들어가는 샘플 수

  function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  async function decodeToMono16k(arrayBuffer) {
    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) {
      throw new Error('이 브라우저는 오디오 변환을 지원하지 않아요.');
    }

    const decodeCtx = new Ctx();
    let decoded;
    try {
      decoded = await decodeCtx.decodeAudioData(arrayBuffer);
    } finally {
      decodeCtx.close();
    }

    // 길이가 0이면 아래 OfflineAudioContext 생성에서 예외가 난다.
    const frameCount = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
    if (!frameCount) {
      throw new Error('오디오에서 소리를 찾지 못했어요.');
    }

    const offline = new (global.OfflineAudioContext || global.webkitOfflineAudioContext)(
      1,
      frameCount,
      TARGET_SAMPLE_RATE
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();

    const rendered = await offline.startRendering();
    return { samples: rendered.getChannelData(0), duration: decoded.duration };
  }

  function floatToInt16(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const clamped = Math.max(-1, Math.min(1, input[i]));
      output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    return output;
  }

  function encodeMp3(samples, bitrateKbps, onProgress) {
    if (!global.lamejs) {
      throw new Error('오디오 변환기를 불러오지 못했어요. 새로고침 후 다시 시도해주세요.');
    }

    const encoder = new global.lamejs.Mp3Encoder(1, TARGET_SAMPLE_RATE, bitrateKbps);
    const pcm = floatToInt16(samples);
    const chunks = [];

    for (let offset = 0; offset < pcm.length; offset += SAMPLES_PER_CHUNK) {
      const slice = pcm.subarray(offset, offset + SAMPLES_PER_CHUNK);
      const encoded = encoder.encodeBuffer(slice);
      if (encoded.length > 0) {
        chunks.push(encoded);
      }
      if (onProgress && offset % (SAMPLES_PER_CHUNK * 400) === 0) {
        onProgress(offset / pcm.length);
      }
    }

    const flushed = encoder.flush();
    if (flushed.length > 0) {
      chunks.push(flushed);
    }

    return new Blob(chunks, { type: 'audio/mpeg' });
  }

  /*
   * 녹음을 일정 길이 조각으로 잘라 각각 mp3로 인코딩한다.
   *
   * 통째로 보내면 20분짜리 전사가 서버 실행 시간 제한(5분)을 넘겨 실패한다.
   * 조각으로 나누면 각 요청이 제한 안에 들어오고, 여러 조각을 동시에 보낼 수
   * 있어 전체 대기 시간도 짧아진다. startSeconds는 조각이 원본에서 시작하는
   * 위치이고, 서버가 타임스탬프를 원본 기준으로 되돌리는 데 쓴다.
   */
  async function compressToChunks(file, options) {
    const opts = options || {};
    const chunkSeconds = opts.chunkSeconds || 240;
    const maxBytes = opts.maxBytes || 4200000;
    const onStage = opts.onStage || function () {};

    onStage('decode');
    const arrayBuffer = await readAsArrayBuffer(file);
    const { samples, duration } = await decodeToMono16k(arrayBuffer);

    const samplesPerChunk = chunkSeconds * TARGET_SAMPLE_RATE;
    const total = Math.max(1, Math.ceil(samples.length / samplesPerChunk));
    const chunks = [];

    for (let index = 0; index < total; index++) {
      const from = index * samplesPerChunk;
      const slice = samples.subarray(from, Math.min(from + samplesPerChunk, samples.length));
      if (!slice.length) {
        continue;
      }

      onStage('encode', { index: index + 1, total: total });
      const blob = encodeMp3(slice, DEFAULT_BITRATE_KBPS);

      if (blob.size > maxBytes) {
        throw new Error('녹음을 처리 가능한 크기로 줄이지 못했어요. 더 짧게 잘라서 올려주세요.');
      }

      chunks.push({ blob: blob, startSeconds: index * chunkSeconds });
    }

    return { chunks: chunks, duration: duration };
  }

  global.AudioCompressor = { compressToChunks: compressToChunks };
})(window);
