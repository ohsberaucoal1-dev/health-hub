/* Health Hub: descriptive analysis only. No inferred clinical score. */
(function () {
  'use strict';
  const KEY = 'healthhub-data-v1';
  const fields = ['fatigue', 'sleep_minutes', 'steps', 'resting_hr'];
  const isNumber = v => typeof v === 'number' && Number.isFinite(v);
  const fmt = n => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n);
  const dateLabel = s => new Date(s + 'T12:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s; }
  function validate(raw) {
    if (!raw || typeof raw !== 'object' || raw.source !== 'Health Hub') throw Error('Sumber harus "Health Hub". Gunakan contoh format yang tersedia.');
    if (!Array.isArray(raw.records) || !raw.records.length || raw.records.length > 3660) throw Error('Berkas harus memuat 1–3.660 catatan harian.');
    let scale = null;
    if (raw.fatigue_scale != null) {
      const s = raw.fatigue_scale;
      if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 120 || !isNumber(s.min) || !isNumber(s.max) || s.min >= s.max || !Number.isFinite(s.max - s.min)) throw Error('Skala fatigue memerlukan nama, min dan max numerik, dengan min lebih kecil dari max.');
      scale = { name: s.name.trim(), min: s.min, max: s.max };
    }
    const seen = new Set();
    const records = raw.records.map((r, i) => {
      if (!r || !validDate(r.date)) throw Error(`Tanggal catatan ${i + 1} tidak valid. Gunakan YYYY-MM-DD.`);
      if (seen.has(r.date)) throw Error(`Tanggal ${r.date} duplikat. Agregasikan data harian di sumber terlebih dahulu.`);
      seen.add(r.date);
      const clean = { date: r.date };
      for (const key of fields) {
        const v = r[key] == null ? null : r[key];
        if (v !== null && !isNumber(v)) throw Error(`${key} pada ${r.date} harus berupa angka atau null.`);
        if (v !== null && key !== 'fatigue' && (v < 0 || (key === 'sleep_minutes' && v > 1440) || (key === 'steps' && !Number.isInteger(v)) || (key === 'resting_hr' && v === 0))) throw Error(`Nilai ${key} pada ${r.date} tidak valid. Nilai hilang harus null, bukan angka pengganti.`);
        if (key === 'fatigue' && v !== null && (!scale || v < scale.min || v > scale.max)) throw Error(`Fatigue pada ${r.date} memerlukan fatigue_scale dan nilai dalam rentang sumber.`);
        clean[key] = v;
      }
      return clean;
    }).sort((a, b) => a.date.localeCompare(b.date));
    return { source: 'Health Hub', fatigue_scale: scale, records };
  }
  function shiftDate(date, offset) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }
  function average(records, field) { const values = records.map(r => r[field]).filter(isNumber); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
  function baseline(records, date) { const start = shiftDate(date, -7); return records.filter(r => r.date >= start && r.date < date); }
  function duration(v) { if (!isNumber(v)) return '—'; const minutes = Math.round(v); return `${Math.floor(minutes / 60)}j ${minutes % 60}m`; }
  function makeDemo() {
    const fatigue = [36, 39, 45, 43, 51, 48, 40, 37, 42, 46, 50, 43, 39, 35, 44, 48, 52, 46, 41, 38, 42, 48, 44, 51, 58, 49, 45, 53, 47, 42];
    const sleep = [455, 440, 415, 430, 370, 390, 450, 465, 420, 405, 380, 430, 460, 470, 425, 395, 365, 410, 445, 450, 425, 390, 430, 395, 360, 410, 435, 375, 420, 405];
    const now = new Date(); const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return { source: 'Health Hub', fatigue_scale: { name: 'Indeks ilustrasi (demo)', min: 0, max: 100 }, records: fatigue.map((v, i) => ({ date: shiftDate(end, i - 29), fatigue: v, sleep_minutes: sleep[i], steps: 5100 + (i * 719 % 4300), resting_hr: 61 + i % 7 })) };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { validate, average, baseline, duration, makeDemo, shiftDate };
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  let data = makeDemo(), mode = 'demo', days = 7;
  let apiKey = '', apiTimer = null, apiGeneration = 0, apiBusy = false, serverSync = null, apiState = '';
  let storageWarning = '';
  try { const saved = localStorage.getItem(KEY); if (saved) { data = validate(JSON.parse(saved)); mode = 'import'; } } catch (_) { storageWarning = 'Penyimpanan lokal tidak tersedia atau data lama tidak valid. Mode demo ditampilkan.'; }
  let selected = data.records.at(-1).date;
  const references = [
    ['Kusuma & Susilowati · 2023', 'Fatigue among Youth Workers in Construction Projects of PT ABC', 'Menara Journal of Health Science · 212 pekerja muda · Cross-sectional', 'Ringkasan melaporkan 69,3% mengalami kelelahan sedang. Tidur dan higiene tidur yang buruk berkaitan dengan kelelahan lebih tinggi.', 'Konteks: pekerja muda konstruksi. Proporsi populasi bukan probabilitas kelelahan pengguna.'],
    ['Siraith, Sigalingging & Sembiring · Tahun tidak tersedia', 'Gambaran Kualitas Tidur dan Kelelahan Pasien Kanker yang Menjalani Kemoterapi', 'Medha Nursing Journal · 90 pasien · Deskriptif', 'Ringkasan mencatat 86,7% memiliki kualitas tidur buruk dan 83,3% mengalami kelelahan.', 'Studi deskriptif: dua proporsi ini tidak membuktikan hubungan sebab-akibat. Konteks pasien kemoterapi.'],
    ['Pardyani & Susilowati · 2024', 'Stress Kerja dan Kualitas Tidur sebagai Determinan Utama Kelelahan Kerja pada Pekerja Konstruksi', 'Suara Forikes · Tinjauan 9 artikel · Protokol PRISMA', 'Tinjauan menyoroti stres kerja dan kualitas tidur sebagai determinan yang paling sering ditemukan.', 'Menjadi landasan untuk menempatkan tidur sebagai konteks utama. Tidak menghasilkan rumus skor wearable.', 'https://www.forikes-ejournal.com/index.php/SF/article/view/sf15205'],
    ['Budiawan, Prastawa, Kusumaningsari & Sari · 2016', 'Pengaruh Monoton, Kualitas Tidur, Psikofisiologi, Distraksi, dan Kelelahan Kerja terhadap Tingkat Kewaspadaan', 'J@ti Undip: Jurnal Teknik Industri · 25 masinis dan asisten', 'Menurut ringkasan, kualitas tidur berperan sebelum dinas dan kelelahan berperan sesudah dinas terhadap kewaspadaan.', 'Kewaspadaan merupakan luaran yang berbeda dari skor fatigue. Persentase penelitian tidak diterapkan pada individu.', 'https://ejournal.undip.ac.id/index.php/jgti/article/view/10152/0'],
    ['Sari, Setyaningsih & Suroto · 2020', 'Hubungan Ritme Circadian dan Kebisingan terhadap Fatigue pada Pekerja PT APAC Inti Corpora', 'MKMI · 45 pekerja spinning · Cross-sectional', 'Ringkasan melaporkan hubungan ritme sirkadian (p=0,009) dan kebisingan (p=0,025) dengan kelelahan.', 'Data tidur, langkah, dan HR tidak mengukur kebisingan atau mengidentifikasi gangguan ritme sirkadian.'],
    ['Ardianti, Santiasih & Kusminah · 2023', 'Pengaruh Usia, Kualitas Tidur dan Kebiasaan Sarapan terhadap Kelelahan Karyawan Perusahaan Produksi Beton', 'Conference on Safety Engineering and Its Application · 36 karyawan', 'Ringkasan melaporkan hasil usia dan kualitas tidur (p=0,050), sementara sarapan tidak signifikan (p=0,904).', 'Pengukuran kelelahan memakai reaction timer. Nilai p bukan besaran risiko individu atau bobot algoritma.'],
    ['Taufik, Ikhsan, Hermansyah, Syamsuddin & Mardhiah · 2024', 'Hubungan Intensitas Nyeri dengan Pemenuhan Kebutuhan Istirahat dan Tidur pada Pasien Postoperasi Ekstremitas Bawah', 'Journal Getsempena Health Science Journal · 81 pasien · Cross-sectional', 'Ringkasan mengaitkan nyeri dengan kebutuhan istirahat (OR=3,63) dan tidur (OR=3,938).', 'Odds ratio tersebut mengenai nyeri dan istirahat/tidur pada pasien; bukan efek tidur terhadap fatigue wearable.'],
    ['Prasetya & Yunus · 2025', 'Analisis Pengaruh Faktor Individu, Beban Kerja, dan Kualitas Tidur terhadap Kelelahan Kerja di CV Mentari Pagi Engineering', 'Jurnal Pendidikan Teknik Mesin · 30 pekerja · Regresi logistik ordinal', 'Menurut ringkasan, kualitas tidur signifikan secara parsial (p=0,03), sedangkan beberapa faktor lain tidak.', 'Sampel dan konteks terbatas. Temuan tidak dapat digunakan untuk menghitung kelelahan personal dari sensor.']
  ];
  $('references').innerHTML = references.map((r, i) => `<article class="panel reference"><span class="ref-number">REFERENSI ${String(i + 1).padStart(2, '0')}</span><h3>${escape(r[1])}</h3><div class="ref-meta">${escape(r[0])}<br>${escape(r[2])}</div><p>${escape(r[3])}</p><p><strong>Batas interpretasi.</strong> ${escape(r[4])}</p>${r[5] ? `<a href="${r[5]}" target="_blank" rel="noopener noreferrer">Lihat halaman penerbit ↗</a>` : '<span class="muted">Sumber: ringkasan jurnal yang diberikan</span>'}</article>`).join('');
  function comparison(row, key) {
    const history = baseline(data.records, selected); const avg = average(history, key); const n = history.filter(r => isNumber(r[key])).length;
    if (!isNumber(row[key])) return 'Belum tersedia dari sumber';
    if (avg === null) return 'Riwayat pembanding belum tersedia';
    const diff = row[key] - avg;
    const unit = { fatigue: 'poin', sleep_minutes: 'menit', steps: 'langkah', resting_hr: 'bpm' }[key];
    return `${diff > 0 ? '↑' : diff < 0 ? '↓' : '→'} ${fmt(Math.abs(diff))} ${unit} ${diff > 0 ? 'di atas' : diff < 0 ? 'di bawah' : 'dari'} rerata · ${n}/7 hari sebelumnya`;
  }
  function renderChart(records) {
    const width = 600, height = 218, left = 35, right = 560, top = 17, bottom = 184;
    const dates = Array.from({ length: days }, (_, i) => shiftDate(selected, i - days + 1));
    const byDate = new Map(records.map(r => [r.date, r]));
    const scale = data.fatigue_scale; const sleepMax = Math.max(10, ...records.filter(r => isNumber(r.sleep_minutes)).map(r => Math.ceil(r.sleep_minutes / 60 / 2) * 2));
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafik fatigue dan durasi tidur ${days} hari. Nilai harian lengkap tersedia di Tren kesehatan.">`;
    for (let i = 0; i <= 4; i++) {
      const y = top + (bottom - top) * i / 4;
      svg += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#edf0e8" stroke-dasharray="3 5"/><text x="25" y="${y + 3}" text-anchor="end" fill="#9ca494" font-size="9">${scale ? fmt(scale.max - (scale.max - scale.min) * i / 4) : '—'}</text><text x="575" y="${y + 3}" fill="#aaa0bd" font-size="9">${fmt(sleepMax * (1 - i / 4))}</text>`;
    }
    ['fatigue', 'sleep_minutes'].forEach((key, index) => {
      let previous = null; const color = index === 0 ? '#34735a' : '#b3a5ce';
      dates.forEach((date, i) => {
        const value = byDate.get(date)?.[key];
        if (!isNumber(value) || (key === 'fatigue' && !scale)) { previous = null; return; }
        const normalized = key === 'fatigue' ? (value - scale.min) / (scale.max - scale.min) : value / 60 / sleepMax;
        const x = left + (right - left) * i / (days - 1), y = bottom - normalized * (bottom - top);
        if (previous) svg += `<line x1="${previous.x}" y1="${previous.y}" x2="${x}" y2="${y}" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>`;
        svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="white" stroke="${color}" stroke-width="2"><title>${dateLabel(date)}: ${key === 'fatigue' ? fmt(value) + ' poin' : duration(value)}</title></circle>`;
        previous = { x, y };
      });
    });
    dates.forEach((d, i) => { if (days === 7 || i % 5 === 0 || i === days - 1) svg += `<text x="${left + (right - left) * i / (days - 1)}" y="207" fill="#939c8b" text-anchor="middle" font-size="9">${new Date(d + 'T12:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</text>`; });
    $('chart').innerHTML = svg + '</svg>';
  }
  function render() {
    const row = data.records.find(r => r.date === selected) || { date: selected };
    const scale = data.fatigue_scale;
    $('date').value = selected;
    $('mode-label').textContent = mode === 'server' ? 'Data server' : mode === 'demo' ? 'Mode demo' : mode === 'empty' ? 'Belum ada data' : 'Data impor lokal';
    $('mode-copy').textContent = mode === 'server' ? apiState : mode === 'demo' ? 'Data ilustrasi, bukan kondisi kesehatan Anda. Hubungkan API untuk data asli.' : mode === 'empty' ? 'Hubungkan API atau impor berkas dari Health Hub untuk memulai.' : 'Berkas tersimpan lokal. Hubungkan API untuk menampilkan data yang diterima server.';
    $('fatigue-value').textContent = isNumber(row.fatigue) ? fmt(row.fatigue) : '—';
    $('fatigue-max').textContent = scale && scale.min === 0 ? '/ ' + fmt(scale.max) : '';
    $('score-badge').textContent = mode === 'demo' ? 'DATA ILUSTRASI' : 'DARI SUMBER';
    $('score-caption').textContent = scale ? scale.name : 'Skala sumber belum tersedia';
    $('fatigue-delta').textContent = comparison(row, 'fatigue');
    $('score-note').textContent = scale ? `Rentang sumber ${fmt(scale.min)}–${fmt(scale.max)}. Tanpa kategori klinis atau perhitungan skor baru.` : 'Skor fatigue belum tersedia. Website tidak menghitung skor dari data sensor.';
    const sleepAvg = average(baseline(data.records, selected), 'sleep_minutes');
    $('main-insight').textContent = !isNumber(row.sleep_minutes) ? 'Data tidur tanggal ini belum tersedia. Periksa sinkronisasi Zepp → Health Connect → Health Hub, lalu impor ulang data.' : sleepAvg === null ? `Durasi tidur tercatat ${duration(row.sleep_minutes)}. Riwayat belum cukup untuk perbandingan; durasi saja tidak mengukur kualitas tidur.` : `Tidur tercatat ${duration(row.sleep_minutes)}, ${fmt(Math.abs(row.sleep_minutes - sleepAvg))} menit ${row.sleep_minutes < sleepAvg ? 'lebih singkat' : row.sleep_minutes > sleepAvg ? 'lebih lama' : 'berbeda'} dari rerata sebelumnya. Ini konteks untuk membaca fatigue, bukan bukti penyebabnya. [3]`;
    $('day-caption').textContent = dateLabel(selected);
    const cards = [['sleep_minutes', '☾', 'Tidur malam sebelumnya', duration(row.sleep_minutes), ''], ['steps', '↗', 'Langkah harian', isNumber(row.steps) ? fmt(row.steps) : '—', 'langkah'], ['resting_hr', '♡', 'Detak jantung istirahat', isNumber(row.resting_hr) ? fmt(row.resting_hr) : '—', 'bpm']];
    $('metrics').innerHTML = cards.map(([key, icon, label, value, unit]) => `<article class="metric"><div class="metric-title"><span class="metric-icon">${icon}</span>${label}</div><div class="metric-number">${value}<small>${unit}</small></div><div class="metric-bottom">${comparison(row, key)}</div></article>`).join('');
    const records = data.records.filter(r => r.date >= shiftDate(selected, 1 - days) && r.date <= selected);
    $('scale-label').textContent = scale ? `(${fmt(scale.min)}–${fmt(scale.max)})` : '(tanpa skala)';
    renderChart(records);
    $('history').innerHTML = records.length ? [...records].reverse().map(r => `<tr><td>${dateLabel(r.date)}</td><td>${isNumber(r.fatigue) ? fmt(r.fatigue) : '—'}</td><td>${duration(r.sleep_minutes)}</td><td>${isNumber(r.steps) ? fmt(r.steps) : '—'}</td><td>${isNumber(r.resting_hr) ? fmt(r.resting_hr) + ' bpm' : '—'}</td></tr>`).join('') : '<tr><td colspan="5">Tidak ada data pada periode ini. Pilih tanggal lain atau impor data.</td></tr>';
    const avgFatigue = average(records, 'fatigue'); const paired = records.filter(r => isNumber(r.fatigue) && isNumber(r.sleep_minutes)).length;
    $('trend-summary').textContent = `${dateLabel(shiftDate(selected, 1 - days))} – ${dateLabel(selected)}: ${records.length}/${days} hari tersedia. Rerata fatigue ${avgFatigue === null ? 'belum tersedia' : fmt(avgFatigue) + ' poin pada skala sumber'}, rerata tidur ${duration(average(records, 'sleep_minutes'))}. Terdapat ${paired} hari dengan kedua metrik. Ringkasan ini tidak menguji korelasi atau sebab-akibat. Ubah periode dan tanggal di Ringkasan.`;
    $('connection-status').textContent = mode === 'server' ? apiState : mode === 'demo' ? 'Status: mode demo · Hubungkan API untuk data asli.' : mode === 'empty' ? 'Status: menunggu data Health Hub.' : `Status: ${data.records.length} catatan diimpor lokal · Catatan terakhir ${dateLabel(data.records.at(-1).date)}.`;
    $('export').disabled = !data.records.length;
  }
  function navigate() {
    const allowed = ['dashboard', 'trends', 'research', 'connection'];
    const page = allowed.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== page; });
    document.querySelectorAll('[data-page]').forEach(el => { el.classList.toggle('active', el.dataset.page === page); if (el.dataset.page === page) { el.setAttribute('aria-current', 'page'); $('crumb').textContent = el.textContent.replace('8', '').trim(); } else el.removeAttribute('aria-current'); });
  }
  $('date').addEventListener('change', e => { if (validDate(e.target.value)) { selected = e.target.value; render(); } });
  document.querySelectorAll('[data-days]').forEach(button => button.addEventListener('click', () => { days = Number(button.dataset.days); document.querySelectorAll('[data-days]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); }); render(); }));
  $('import-shortcut').addEventListener('click', () => { location.hash = 'connection'; });
  function download(value, name) { const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  $('template').addEventListener('click', () => download({ ...makeDemo(), records: makeDemo().records.slice(-2) }, 'health-hub-contoh-demo.json'));
  $('export').addEventListener('click', () => download({ ...data, export_mode: mode }, `health-hub-${mode}.json`));
  $('file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    const message = $('import-message'); message.classList.remove('error');
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('Berkas melebihi 2 MB. Kurangi periode ekspor.');
      const raw = JSON.parse(await file.text()); const next = validate(raw);
      stopApi(); data = next; mode = raw.export_mode === 'demo' || next.fatigue_scale?.name === 'Indeks ilustrasi (demo)' ? 'demo' : 'import'; selected = data.records.at(-1).date;
      let persisted = true;
      try { if (mode === 'demo') localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { persisted = false; }
      render(); message.textContent = `${data.records.length} catatan berhasil dimuat${mode === 'demo' ? ' sebagai demo' : ''}. ${persisted ? 'Buka Ringkasan untuk melihat analisis.' : 'Penyimpanan gagal; data hanya tersedia selama halaman ini terbuka.'}`;
    } catch (error) { message.classList.add('error'); message.textContent = error instanceof SyntaxError ? 'JSON tidak valid. Periksa format berkas; data sebelumnya tetap digunakan.' : error.message; }
    event.target.value = '';
  });
  $('clear-data').addEventListener('click', () => {
    try { localStorage.removeItem(KEY); } catch (_) { $('import-message').textContent = 'Browser menolak penghapusan penyimpanan. Hapus data situs melalui pengaturan browser.'; $('import-message').classList.add('error'); return; }
    stopApi(); data = { source: 'Health Hub', fatigue_scale: null, records: [] }; mode = 'empty'; render(); $('import-message').classList.remove('error'); $('import-message').textContent = 'Data lokal dihapus dan koneksi diputus. Data pada server tidak dihapus.';
  });
  $('demo').addEventListener('click', () => { stopApi(); data = makeDemo(); mode = 'demo'; selected = data.records.at(-1).date; render(); $('import-message').classList.remove('error'); $('import-message').textContent = 'Demo ditampilkan sementara. Data impor tersimpan tidak ditimpa.'; });
  function stopApi() {
    apiGeneration++; apiKey = ''; apiBusy = false; clearInterval(apiTimer); apiTimer = null;
    $('api-key').value = ''; $('refresh-api').disabled = true; $('disconnect-api').disabled = true;
    $('api-message').textContent = 'API belum terhubung.'; $('api-message').classList.remove('error');
  }
  async function refreshApi() {
    if (!apiKey || apiBusy) return;
    const generation = apiGeneration; apiBusy = true;
    $('refresh-api').disabled = true;
    try {
      const response = await fetch('/api/v1/records', { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (generation !== apiGeneration) return;
      const raw = await response.json().catch(() => { throw Error('API tidak tersedia. Jalankan dashboard melalui server Node.js, bukan hosting statis.'); });
      if (generation !== apiGeneration) return;
      if (!response.ok) throw Error(raw.message || `API gagal (${response.status}).`);
      if (!Array.isArray(raw.records) || raw.source !== 'Health Hub') throw Error('Respons API tidak sesuai format Health Hub.');
      const next = raw.records.length ? validate(raw) : { source: 'Health Hub', fatigue_scale: raw.fatigue_scale, records: [] };
      const followLatest = mode !== 'server' || !data.records.length || selected === data.records.at(-1)?.date;
      data = next; mode = 'server'; serverSync = raw.sync;
      if (followLatest && data.records.length) selected = data.records.at(-1).date;
      apiState = data.records.length ? `${data.records.length} hari · Diterima server ${new Date(serverSync.received_at).toLocaleString('id-ID')} · Diperiksa ${new Date().toLocaleTimeString('id-ID')} · Periksa otomatis setiap 30 detik.` : 'Terhubung. Server belum menerima data untuk profil ini; menunggu kiriman Health Hub.';
      $('api-message').classList.remove('error'); $('api-message').textContent = apiState;
      $('disconnect-api').disabled = false; render();
    } catch (error) {
      if (generation !== apiGeneration) return;
      apiState = `Pembaruan gagal: ${error.message} ${mode === 'server' ? 'Menampilkan salinan terakhir; data mungkin belum terbaru.' : ''}`;
      $('api-message').textContent = apiState; $('api-message').classList.add('error'); render();
    } finally { if (generation === apiGeneration) { apiBusy = false; $('refresh-api').disabled = !apiKey; } }
  }
  $('api-form').addEventListener('submit', event => {
    event.preventDefault();
    const key = $('api-key').value.trim();
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(key)) { $('api-message').textContent = 'Masukkan API key lengkap dari konfigurasi server.'; $('api-message').classList.add('error'); return; }
    stopApi(); apiKey = key;
    // Clear previous server profile immediately: never show one profile under another key.
    data = { source: 'Health Hub', fatigue_scale: null, records: [] }; mode = 'server'; apiState = 'Menghubungkan ke server…'; render();
    $('disconnect-api').disabled = false;
    refreshApi(); apiTimer = setInterval(() => { if (!document.hidden) refreshApi(); }, 30000);
  });
  $('refresh-api').addEventListener('click', refreshApi);
  $('disconnect-api').addEventListener('click', () => { stopApi(); data = { source: 'Health Hub', fatigue_scale: null, records: [] }; mode = 'empty'; render(); });
  window.addEventListener('hashchange', navigate); render(); navigate(); if (storageWarning) $('import-message').textContent = storageWarning;
})();
