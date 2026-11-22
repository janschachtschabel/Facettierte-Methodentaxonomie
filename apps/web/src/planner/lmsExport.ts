import type { NeutralLearningScenario, ScenarioPhaseRow } from './scenarioModel.js';

const escXml = (s: string) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const escHtml = (s: string) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Zero-dependency CRC32 + Stored-ZIP builder for IMS Common Cartridge (.imscc)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function buildStoredZip(files: Array<{ path: string; content: string }>): Uint8Array {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.path);
    const dataBytes = enc.encode(file.content);
    const crc = crc32(dataBytes);

    const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Stored (no compression)
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(dataBytes, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of localParts) {
    out.set(p, pos);
    pos += p.length;
  }
  for (const p of centralParts) {
    out.set(p, pos);
    pos += p.length;
  }
  out.set(eocd, pos);
  return out;
}

function buildPhaseHtmlPage(row: ScenarioPhaseRow, scenarioTitle: string): string {
  const stepsHtml = (row.block?.durchfuehrung || []).length
    ? `<ol>${row.block!.durchfuehrung.map((s) => `<li>${escHtml(s)}</li>`).join('')}</ol>`
    : '<p>Gemäß Methodenprofil durchführen.</p>';

  const diffHtml = row.differentiation.length
    ? `<h2>Binnendifferenzierung</h2><ul>${row.differentiation
        .map((d) => `<li><strong>${escHtml(d.groupLabel)}:</strong> ${escHtml(d.measure)}</li>`)
        .join('')}</ul>`
    : '';

  const oerHtml = row.oerResources.length
    ? `<h2>Verknüpfte OER-Materialien (WirLernenOnline)</h2><ul>${row.oerResources
        .map(
          (o) =>
            `<li><a href="${escHtml(o.url)}" target="_blank" rel="noreferrer">${escHtml(o.title)}</a>${
              o.license ? ` (${escHtml(o.license)})` : ''
            }${o.description ? ` – ${escHtml(o.description)}` : ''}</li>`
        )
        .join('')}</ul>`
    : '';

  const sourcesHtml = (row.block?.quellen || []).length
    ? `<h2>Methoden-Quellen</h2><ul>${row.block!.quellen
        .map((q) =>
          q.url
            ? `<li><a href="${escHtml(q.url)}" target="_blank" rel="noreferrer">${escHtml(q.titel)}</a></li>`
            : `<li>${escHtml(q.titel)}</li>`
        )
        .join('')}</ul>`
    : '';

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(row.orderLabel)} ${escHtml(row.methodName)}</title>
  <style>
    body { font-family: Georgia, serif; color: #14212E; max-width: 780px; margin: 24px auto; padding: 0 20px; line-height: 1.6; }
    h1, h2 { font-family: Arial, sans-serif; color: #2C5D8A; }
    .meta { background: #F4F7F4; border-left: 4px solid #2C5D8A; padding: 10px 14px; margin: 14px 0; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #C6D0C9; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #EEF2EE; }
  </style>
</head>
<body>
  <p><small>${escHtml(scenarioTitle)}</small></p>
  <h1>${escHtml(row.orderLabel)} · ${escHtml(row.phaseLabel)}: ${escHtml(row.methodName)}</h1>
  <div class="meta">
    <strong>FMT-Methode:</strong> <a href="${escHtml(row.methodUrl)}" target="_blank" rel="noreferrer">${escHtml(row.methodName)} (${escHtml(row.methodRange)})</a><br/>
    <strong>Dauer:</strong> ${row.durationMin} min${row.orientationRange ? ` (Richtwert: ${escHtml(row.orientationRange)})` : ''} ·
    <strong>Sozialform:</strong> ${escHtml(row.socialForm)} ·
    <strong>Lernumgebung:</strong> ${escHtml(row.environment)}
  </div>
  <table>
    <tr><th>Rolle Lehrkraft</th><th>Rolle Lernende</th><th>Materialien</th></tr>
    <tr>
      <td>${escHtml(row.teacherRole)}</td>
      <td>${escHtml(row.learnerRole)}</td>
      <td>${escHtml(row.materials.join(', ') || '–')}</td>
    </tr>
  </table>
  <h2>Durchführungsschritte</h2>
  ${stepsHtml}
  ${diffHtml}
  ${oerHtml}
  ${sourcesHtml}
</body>
</html>`;
}

/**
 * Exports the FMT scenario + linked methods + differentiation + WLO OER resources
 * as an IMS Common Cartridge 1.3 (.imscc) ZIP archive importable in Moodle, ILIAS, Canvas, itslearning.
 */
export function exportScenarioToImscc(
  scenario: NeutralLearningScenario,
  rows: ScenarioPhaseRow[]
): Uint8Array {
  const files: Array<{ path: string; content: string }> = [];
  const itemsXml: string[] = [];
  const resourcesXml: string[] = [];

  rows.forEach((row, idx) => {
    const itemId = `item_phase_${idx + 1}`;
    const resId = `res_phase_${idx + 1}`;
    const href = `web_resources/phase_${idx + 1}_${row.methodId.replace(/[^a-z0-9_-]/gi, '_')}.html`;
    files.push({ path: href, content: buildPhaseHtmlPage(row, scenario.metadata.title) });

    let childLinks = '';
    row.oerResources.forEach((oer, oi) => {
      const linkItemId = `item_oer_${idx + 1}_${oi + 1}`;
      const linkResId = `res_oer_${idx + 1}_${oi + 1}`;
      const linkHref = `web_resources/oer_${idx + 1}_${oi + 1}.xml`;
      files.push({
        path: linkHref,
        content: `<?xml version="1.0" encoding="UTF-8"?>
<webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imswl_v1p3">
  <title>${escXml(oer.title)}</title>
  <url href="${escXml(oer.url)}" target="_blank"/>
</webLink>`
      });
      childLinks += `\n          <item identifier="${linkItemId}" identifierref="${linkResId}"><title>OER: ${escXml(oer.title)}</title></item>`;
      resourcesXml.push(
        `    <resource identifier="${linkResId}" type="imswl_xmlv1p3" href="${linkHref}"><file href="${linkHref}"/></resource>`
      );
    });

    itemsXml.push(
      `        <item identifier="${itemId}" identifierref="${resId}">
          <title>${escXml(`${row.orderLabel} ${row.phaseLabel} – ${row.methodName} (${row.durationMin} min)`)}</title>${childLinks}
        </item>`
    );
    resourcesXml.push(
      `    <resource identifier="${resId}" type="webcontent" href="${href}"><file href="${href}"/></resource>`
    );
  });

  files.push({
    path: 'fmt_scenario_imsld.json',
    content: JSON.stringify(scenario, null, 2)
  });

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="fmt_imscc_${Date.now()}"
          xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1"
          xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/resource"
          xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/manifest">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.3.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title><lomimscc:string language="de">${escXml(scenario.metadata.title)}</lomimscc:string></lomimscc:title>
        <lomimscc:description><lomimscc:string language="de">FMT Lehr- und Lernszenario (${escXml(scenario.metadata.subject)} · ${escXml(scenario.metadata.educationalLevel)} · ${scenario.metadata.totalDurationMin} min)</lomimscc:string></lomimscc:description>
      </lomimscc:general>
      <lomimscc:rights>
        <lomimscc:description><lomimscc:string language="de">CC BY 4.0 – Facettierte Methodentaxonomie (FMT), Jan Schachtschabel</lomimscc:string></lomimscc:description>
      </lomimscc:rights>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_fmt" structure="rooted-hierarchy">
      <item identifier="root">
        <title>${escXml(scenario.metadata.title)}</title>
${itemsXml.join('\n')}
      </item>
    </organization>
  </organizations>
  <resources>
${resourcesXml.join('\n')}
  </resources>
</manifest>`;

  files.unshift({ path: 'imsmanifest.xml', content: manifest });
  return buildStoredZip(files);
}

/**
 * Exports the FMT scenario to a Moodle-compatible XML backup description
 * containing sections, FMT method pages, differentiation notes, and OER URL activities.
 */
export function exportScenarioToMoodleXml(
  scenario: NeutralLearningScenario,
  rows: ScenarioPhaseRow[]
): string {
  const now = Math.floor(Date.now() / 1000);
  let actId = 1;
  const activities: string[] = [];

  rows.forEach((row) => {
    const pageHtml = buildPhaseHtmlPage(row, scenario.metadata.title);
    activities.push(`    <activity id="${actId}" moduleid="${actId}" modulename="page" contextid="${actId + 1000}">
      <page id="${actId}">
        <name>${escXml(`${row.orderLabel} ${row.phaseLabel}: ${row.methodName} (${row.durationMin} min)`)}</name>
        <intro>${escXml(row.block?.kurzbeschreibung || row.phaseLabel)}</intro>
        <introformat>1</introformat>
        <content>${escXml(pageHtml)}</content>
        <contentformat>1</contentformat>
        <timemodified>${now}</timemodified>
      </page>
      <sectionid>1</sectionid>
    </activity>`);
    actId++;

    row.oerResources.forEach((oer) => {
      activities.push(`    <activity id="${actId}" moduleid="${actId}" modulename="url" contextid="${actId + 1000}">
      <url id="${actId}">
        <name>${escXml(`OER: ${oer.title}`)}</name>
        <intro>${escXml(oer.description || '')}</intro>
        <introformat>1</introformat>
        <externalurl>${escXml(oer.url)}</externalurl>
        <timemodified>${now}</timemodified>
      </url>
      <sectionid>1</sectionid>
    </activity>`);
      actId++;
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<moodle_backup>
  <information>
    <name>${escXml(scenario.metadata.title)}</name>
    <moodle_version>2023100900</moodle_version>
    <moodle_release>4.3</moodle_release>
    <backup_date>${now}</backup_date>
    <original_course_fullname>${escXml(scenario.metadata.title)}</original_course_fullname>
    <original_course_shortname>${escXml(scenario.metadata.title.slice(0, 24))}</original_course_shortname>
  </information>
  <course>
    <shortname>${escXml(scenario.metadata.title.slice(0, 24))}</shortname>
    <fullname>${escXml(scenario.metadata.title)}</fullname>
    <summary>${escXml(`Fach: ${scenario.metadata.subject} · Thema: ${scenario.metadata.topic} · Dauer: ${scenario.metadata.totalDurationMin} min (FMT CC BY 4.0)`)}</summary>
    <summaryformat>1</summaryformat>
    <format>topics</format>
  </course>
  <sections>
    <section id="1">
      <number>1</number>
      <name>${escXml(scenario.metadata.title)}</name>
      <summary>${escXml(`Granularität ${scenario.metadata.granularity} · Zieltyp ${scenario.metadata.chain}`)}</summary>
      <summaryformat>1</summaryformat>
      <visible>1</visible>
    </section>
  </sections>
  <activities>
${activities.join('\n')}
  </activities>
</moodle_backup>`;
}
