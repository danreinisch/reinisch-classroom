(function () {
  'use strict';

  const CHUNK_SIZE = 6 * 1024 * 1024;
  const MAX_FILE_BYTES = 1024 * 1024 * 1024;
  const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];

  const objectPathEl = document.getElementById('objectPath');
  const videoFileEl = document.getElementById('videoFile');
  const captionFileEl = document.getElementById('captionFile');
  const uploadBtn = document.getElementById('uploadBtn');
  const progressWrap = document.getElementById('progressWrap');
  const videoProgress = document.getElementById('videoProgress');
  const videoPct = document.getElementById('videoPct');
  const captionProgressRow = document.getElementById('captionProgressRow');
  const captionProgress = document.getElementById('captionProgress');
  const captionPct = document.getElementById('captionPct');
  const resultEl = document.getElementById('result');
  const logEl = document.getElementById('log');

  function log(message) {
    const stamp = new Date().toLocaleTimeString();
    logEl.textContent += `\n[${stamp}] ${message}`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes) || 0;
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }

    return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function cleanObjectPath(value) {
    const path = String(value || '').trim();

    if (!path || path.length > 240) return '';
    if (path.startsWith('/') || path.endsWith('/')) return '';
    if (path.includes('..') || path.includes('\\')) return '';
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)) return '';

    const parts = path.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..')) return '';

    return path;
  }

  function captionObjectPath(videoPath) {
    return videoPath.toLowerCase().endsWith('.mp4')
      ? `${videoPath.slice(0, -4)}.en.vtt`
      : `${videoPath}.en.vtt`;
  }

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = '';

    for (const byte of bytes) binary += String.fromCharCode(byte);

    return btoa(binary);
  }

  function uploadMetadata(values) {
    return Object.entries(values)
      .map(([key, value]) => `${key} ${encodeBase64(value)}`)
      .join(',');
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function requestUploadAuthorization(objectPath, file, contentType) {
    const response = await fetch('/.netlify/functions/admin-media-upload-token', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        objectPath,
        contentType,
        size: file.size,
      }),
    });

    const data = await response.json().catch(() => null);

    if (response.status === 401 || response.status === 403) {
      throw new Error('Admin session expired or is not authorized.');
    }

    if (!response.ok || !data || !data.ok) {
      throw new Error((data && data.error) || `Upload authorization failed (${response.status})`);
    }

    return data;
  }

  async function createUpload(file, authorization, objectPath, contentType) {
    const headers = {
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(file.size),
      'Upload-Metadata': uploadMetadata({
        bucketName: authorization.bucket,
        objectName: objectPath,
        contentType,
        cacheControl: authorization.cacheControl || '86400',
      }),
      'x-signature': authorization.token,
      'x-upsert': 'false',
    };

    const response = await fetch(authorization.uploadEndpoint, {
      method: 'POST',
      credentials: 'omit',
      headers,
    });

    if (response.status !== 201) {
      const body = await response.text().catch(() => '');
      throw new Error(`Could not initialize resumable upload (${response.status}): ${body.slice(0, 240)}`);
    }

    const location = response.headers.get('location');

    if (!location) {
      throw new Error('Storage did not return a resumable upload location.');
    }

    return new URL(location, authorization.uploadEndpoint).toString();
  }

  async function currentOffset(uploadUrl, token) {
    const response = await fetch(uploadUrl, {
      method: 'HEAD',
      credentials: 'omit',
      headers: {
        'Tus-Resumable': '1.0.0',
        'x-signature': token,
      },
    });

    if (!response.ok) {
      throw new Error(`Could not recover upload offset (${response.status}).`);
    }

    const offset = Number(response.headers.get('upload-offset'));

    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error('Storage returned an invalid upload offset.');
    }

    return offset;
  }

  async function patchChunk(uploadUrl, token, file, offset) {
    const nextOffset = Math.min(offset + CHUNK_SIZE, file.size);
    const body = file.slice(offset, nextOffset);

    const response = await fetch(uploadUrl, {
      method: 'PATCH',
      credentials: 'omit',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
        'x-signature': token,
      },
      body,
    });

    if (response.status !== 204) {
      const text = await response.text().catch(() => '');
      throw new Error(`Chunk upload failed (${response.status}): ${text.slice(0, 180)}`);
    }

    const returnedOffset = Number(response.headers.get('upload-offset'));

    return Number.isSafeInteger(returnedOffset) && returnedOffset >= nextOffset
      ? returnedOffset
      : nextOffset;
  }

  async function uploadFile(file, objectPath, contentType, onProgress) {
    const authorization = await requestUploadAuthorization(objectPath, file, contentType);
    const uploadUrl = await createUpload(file, authorization, objectPath, contentType);

    let offset = 0;
    onProgress(0, file.size);

    while (offset < file.size) {
      let completed = false;
      let lastError = null;

      for (const delay of RETRY_DELAYS) {
        if (delay) await sleep(delay);

        try {
          offset = await patchChunk(uploadUrl, authorization.token, file, offset);
          onProgress(offset, file.size);
          completed = true;
          break;
        } catch (error) {
          lastError = error;
          log(`Chunk retry: ${error.message}`);

          try {
            offset = await currentOffset(uploadUrl, authorization.token);
            onProgress(offset, file.size);
          } catch (headError) {
            log(`Offset recovery failed: ${headError.message}`);
          }
        }
      }

      if (!completed) {
        throw lastError || new Error('Resumable upload failed after retries.');
      }
    }

    return authorization.publicUrl;
  }

  function setProgress(progressEl, pctEl, uploaded, total) {
    const percentage = total > 0 ? Math.min(100, (uploaded / total) * 100) : 0;
    progressEl.value = percentage;
    pctEl.textContent = `${percentage.toFixed(1)}%`;
  }

  uploadBtn.addEventListener('click', async () => {
    const videoPath = cleanObjectPath(objectPathEl.value);
    const video = videoFileEl.files && videoFileEl.files[0];
    const captions = captionFileEl.files && captionFileEl.files[0];

    resultEl.style.display = 'none';
    resultEl.textContent = '';

    if (!videoPath || !videoPath.toLowerCase().endsWith('.mp4')) {
      window.alert('Enter a valid .mp4 Storage object path.');
      return;
    }

    if (!video) {
      window.alert('Choose an MP4 file.');
      return;
    }

    if (video.size > MAX_FILE_BYTES) {
      window.alert('The video exceeds the 1 GiB classroom-media limit.');
      return;
    }

    if (captions && captions.size > MAX_FILE_BYTES) {
      window.alert('The caption file exceeds the 1 GiB classroom-media limit.');
      return;
    }

    uploadBtn.disabled = true;
    progressWrap.style.display = 'block';
    captionProgressRow.style.display = captions ? 'block' : 'none';
    videoProgress.value = 0;
    videoPct.textContent = '0%';
    captionProgress.value = 0;
    captionPct.textContent = '0%';

    log(`Video: ${video.name} (${formatBytes(video.size)})`);
    log(`Target: classroom-media/${videoPath}`);

    try {
      const videoUrl = await uploadFile(
        video,
        videoPath,
        'video/mp4',
        (uploaded, total) => setProgress(videoProgress, videoPct, uploaded, total)
      );

      log('Video upload complete.');

      let captionUrl = '';

      if (captions) {
        const vttPath = captionObjectPath(videoPath);
        log(`Captions: ${captions.name} (${formatBytes(captions.size)})`);
        log(`Target: classroom-media/${vttPath}`);

        captionUrl = await uploadFile(
          captions,
          vttPath,
          'text/vtt',
          (uploaded, total) => setProgress(captionProgress, captionPct, uploaded, total)
        );

        log('Caption upload complete.');
      }

      const lines = [
        '<strong>Upload complete.</strong>',
        `<div>Video: <a href="${videoUrl}" target="_blank" rel="noopener">${videoUrl}</a></div>`,
      ];

      if (captionUrl) {
        lines.push(
          `<div>Captions: <a href="${captionUrl}" target="_blank" rel="noopener">${captionUrl}</a></div>`
        );
      }

      resultEl.innerHTML = lines.join('');
      resultEl.style.display = 'block';
    } catch (error) {
      console.error('[large-media-upload]', error);
      log(`ERROR: ${error.message || String(error)}`);
      window.alert(error.message || String(error));
    } finally {
      uploadBtn.disabled = false;
    }
  });
})();
