// Simple CSV encode/decode for contacts: name, phone, favorite

function escapeField(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function toCSV(contacts) {
  const header = 'name,phone,favorite';
  const rows = contacts.map(
    (c) => `${escapeField(c.name)},${escapeField(c.phone)},${c.favorite ? '1' : '0'}`
  );
  return [header, ...rows].join('\n');
}

function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur);
  return fields;
}

export function fromCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const [header, ...rows] = lines;
  const cols = header.split(',').map((c) => c.trim().toLowerCase());
  const nameIdx = cols.indexOf('name');
  const phoneIdx = cols.indexOf('phone');
  const favIdx = cols.indexOf('favorite');

  return rows.map((line, i) => {
    const fields = parseCSVLine(line);
    return {
      id: Date.now().toString() + '_' + i,
      name: fields[nameIdx] || '',
      phone: fields[phoneIdx] || '',
      favorite: favIdx >= 0 ? fields[favIdx] === '1' : false,
    };
  });
}
