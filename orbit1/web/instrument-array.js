const PAGE_SIZE = 18;

export function pointReading(point, frame, read) {
  if (point.source) return read(frame, point.source);
  const a = read(frame, point.inputs[0])?.[0];
  const b = read(frame, point.inputs[1])?.[0];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a + (b - a) * point.weight];
}

export function createInstrumentArray({request, read, download}) {
  const get = id => document.getElementById(id);
  const rows = get('array-rows');
  const family = get('array-family');
  const search = get('array-search');
  let manifest;
  let loading = false;
  let attempted = false;
  let frame;
  let history = [];
  let page = 0;
  let selected;
  let rendered = [];

  function label(point, sample) {
    return sample ? sample.map(value => value.toFixed(3)).join(' / ') + ' ' + point.unit : 'Unavailable';
  }

  function chart(point) {
    const canvas = get('array-plot');
    canvas.width = canvas.clientWidth || 420;
    canvas.height = canvas.clientHeight || 150;
    const ctx = canvas.getContext('2d');
    const series = history.slice(-100).map(item => pointReading(point, item, read)?.[0]);
    const values = series.filter(Number.isFinite);
    ctx.fillStyle = '#a2bbcf';
    ctx.font = '12px system-ui';
    if (!values.length) {
      ctx.fillText('No valid samples in this window', 12, 22);
      return;
    }
    const low = Math.min(...values);
    const high = Math.max(...values);
    const range = Math.max(.001, high - low);
    ctx.fillText(`${low.toFixed(3)} to ${high.toFixed(3)} ${point.unit} · last ${series.length} frames`, 12, 18);
    ctx.beginPath();
    ctx.strokeStyle = '#71dfff';
    let drawing = false;
    series.forEach((value, index) => {
      if (!Number.isFinite(value)) { drawing = false; return; }
      const x = 12 + index / Math.max(1, series.length - 1) * (canvas.width - 24);
      const y = canvas.height - 10 - (value - low) / range * (canvas.height - 38);
      if (drawing) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      drawing = true;
    });
    ctx.stroke();
  }

  function render() {
    if (!manifest || !frame || get('instrument-array').hidden) return;
    const query = search.value.trim().toLowerCase();
    const points = manifest.points.filter(point => (family.value === 'all' || point.family === family.value) &&
      [point.id, point.name, point.location].some(text => text.toLowerCase().includes(query)));
    const pageCount = Math.max(1, Math.ceil(points.length / PAGE_SIZE));
    page = Math.min(page, pageCount - 1);
    const shown = points.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    if (shown.length !== rendered.length || shown.some((point, index) => rendered[index].point !== point)) {
      rendered = shown.map(point => {
        const row = document.createElement('tr');
        const button = document.createElement('button');
        button.textContent = point.id;
        button.title = point.name;
        button.setAttribute('aria-label', `${point.id} ${point.name}`);
        button.onclick = () => { selected = point; render(); };
        row.insertCell().append(button);
        row.insertCell().textContent = point.location;
        const value = row.insertCell();
        return {point, row, value, button};
      });
      rows.replaceChildren(...rendered.map(item => item.row));
    }
    for (const {point, value, button} of rendered) {
      value.textContent = label(point, pointReading(point, frame, read));
      button.setAttribute('aria-pressed', String(selected === point));
    }
    get('array-page').textContent = points.length ? `Page ${page + 1} of ${pageCount} · ${points.length} points` : 'No matches';
    get('array-prev').disabled = page === 0;
    get('array-next').disabled = page + 1 >= pageCount;
    if (!selected) selected = shown[0];
    if (!selected) return;
    get('array-selection').textContent = `${selected.id} · ${selected.name}`;
    get('array-reading').textContent = `${frame.t_s.toFixed(2)} s · ${label(selected, pointReading(selected, frame, read))}`;
    get('array-source').textContent = selected.source
      ? `Existing modeled source: ${selected.source}. Chart shows its first channel if it has several.`
      : `${selected.location}. Interpolated from ${selected.inputs.join(' and ')}. A missing input makes this point unavailable.`;
    chart(selected);
  }

  async function load() {
    loading = true;
    attempted = true;
    try {
      manifest = await request('/api/lab/array-manifest');
      const count = manifest.points.filter(point => point.source).length;
      get('array-count').textContent = `${manifest.points.length} points · ${count} existing models · ${manifest.points.length - count} distributed points. ${manifest.diagnostic_count} diagnostics are separate.`;
      for (const name of new Set(manifest.points.map(point => point.family))) family.add(new Option(name, name));
      get('array-export').disabled = false;
      render();
    } catch (error) {
      get('array-count').textContent = error.message;
    } finally {
      loading = false;
    }
  }

  family.onchange = search.oninput = () => { page = 0; render(); };
  get('array-prev').onclick = () => { page--; render(); };
  get('array-next').onclick = () => { page++; render(); };
  get('array-export').onclick = () => {
    if (!manifest || !frame) return;
    const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
    const lines = ['frame_s,id,family,location,source,reading,unit'];
    for (const point of manifest.points) {
      const value = pointReading(point, frame, read);
      lines.push([frame.t_s, point.id, point.family, point.location,
        point.source || point.inputs.join(' + '), value?.join(' / ') || '', point.unit].map(quote).join(','));
    }
    download('orbit1-array-frame.csv', lines.join('\n'), 'text/csv');
  };
  return {
    update(currentFrame, currentHistory) {
      frame = currentFrame;
      history = currentHistory;
      if (get('instrument-array').hidden) return;
      if (!manifest && !loading && !attempted) load();
      render();
    },
  };
}
