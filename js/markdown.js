// Küçük ve güvenli Markdown oluşturucu (dokümantasyon için)
// Desteklenen: ## / ### / #### başlık, paragraf, **kalın**, *italik*, `kod`, [bağlantı](#/… veya https://…),
// - / 1. listeler (iç içe), | tablo |, ``` kod bloğu ```, --- ayırıcı,
// > [!INFO] / [!UYARI] / [!IPUCU] / [!ORNEK] / [!DENE] bilgi kutuları.
// Girdi önce kaçışlanır; yalnızca yukarıdaki yapılar HTML'e dönüşür.
import { icon } from './icons.js';

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TR = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' };
export function slugify(s) {
  return String(s)
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (c) => TR[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CALLOUTS = {
  INFO: { cls: 'info', label: 'Bilgi', icon: 'help' },
  UYARI: { cls: 'warning', label: 'Dikkat', icon: 'alert' },
  IPUCU: { cls: 'success', label: 'İpucu', icon: 'check' },
  ORNEK: { cls: 'example', label: "Ege Dağıtım'dan örnek", icon: 'building' },
  DENE: { cls: 'try', label: 'Uygulamada dene', icon: 'play' },
};

function inline(raw) {
  let s = escHtml(raw);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const u = url.replace(/&amp;/g, '&');
    if (!/^(#|https:\/\/)/.test(u)) return text;
    const ext = u.startsWith('https://');
    return `<a href="${escHtml(u)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  return s;
}

const isTableSep = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const listRe = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function parseList(lines, start, baseIndent) {
  const first = lines[start].match(listRe);
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = lines[i].match(listRe);
    if (!m) break;
    const indent = m[1].length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      // iç içe liste: son maddeye ekle
      const sub = parseList(lines, i, indent);
      if (items.length) items[items.length - 1].children += sub.html;
      i = sub.next;
      continue;
    }
    if (/\d/.test(m[2]) !== ordered) break;
    items.push({ text: m[3], children: '' });
    i++;
  }
  const tag = ordered ? 'ol' : 'ul';
  return { html: `<${tag}>${items.map((it) => `<li>${inline(it.text)}${it.children}</li>`).join('')}</${tag}>`, next: i };
}

function renderBlocks(lines, toc, ids) {
  let out = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // kod bloğu
    const fence = line.match(/^```\s*([\w-]*)/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out += `<pre class="md-code"><code${fence[1] ? ` class="lang-${escHtml(fence[1])}"` : ''}>${escHtml(buf.join('\n'))}</code></pre>`;
      continue;
    }

    // başlık
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = Math.max(2, h[1].length); // makale başlığı h1, içerik h2'den başlar
      const text = h[2].trim();
      let id = slugify(text) || `bolum-${toc.length + 1}`;
      while (ids.has(id)) id += '-2';
      ids.add(id);
      if (level <= 3) toc.push({ level, id, text });
      out += `<h${level} id="${id}">${inline(text)}</h${level}>`;
      i++;
      continue;
    }

    // ayırıcı
    if (/^\s*---+\s*$/.test(line)) { out += '<hr>'; i++; continue; }

    // tablo
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]));
      out += `<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows
        .map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></div>`;
      continue;
    }

    // alıntı / bilgi kutusu
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      const cm = buf[0]?.match(/^\[!(\w+)\]\s*(.*)$/);
      const type = cm && CALLOUTS[cm[1].toUpperCase()];
      if (type) {
        const body = [cm[2], ...buf.slice(1)].filter((l, k) => k > 0 || l.trim());
        out += `<aside class="md-callout md-${type.cls}"><span class="md-callout-ico">${icon(type.icon)}</span><div><strong class="md-callout-title">${type.label}</strong>${renderBlocks(body, [], ids)}</div></aside>`;
      } else {
        out += `<blockquote>${renderBlocks(buf, [], ids)}</blockquote>`;
      }
      continue;
    }

    // liste
    if (listRe.test(line)) {
      const l = parseList(lines, i, line.match(listRe)[1].length);
      out += l.html;
      i = l.next;
      continue;
    }

    // paragraf
    const buf = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,4})\s|^```|^\s*>|^\s*---+\s*$/.test(lines[i]) && !listRe.test(lines[i]) &&
      !(lines[i].trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) buf.push(lines[i++].trim());
    out += `<p>${inline(buf.join(' '))}</p>`;
  }
  return out;
}

// Dönüş: { html, toc: [{ level, id, text }] }
export function renderMarkdown(src) {
  const toc = [];
  const html = renderBlocks(String(src).replace(/\r\n?/g, '\n').split('\n'), toc, new Set());
  return { html, toc };
}

// Arama için düz metin
export function plainText(src) {
  return String(src)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[!\w+\]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`|]/g, ' ')
    .replace(/^\s*[-:]{3,}.*$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
