const fs = require('node:fs');
const path = require('node:path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  BorderStyle, WidthType, AlignmentType, ShadingType, HeadingLevel
} = require('docx');
const { getImageDimensions } = require('./imageDims');

const HEADER_IMG_PATH = path.join(__dirname, '..', 'assets_header.png');
const FOOTER_IMG_PATH = path.join(__dirname, '..', 'assets_footer.png');

const PAGE_CONTENT_WIDTH_PX = 620; // ~6.45in at 96dpi, fits inside standard margins
const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
};
const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '333333' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '333333' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '333333' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '333333' }
};

function scaledImageBox(dims, maxWidth, maxHeight){
  if(!dims || !dims.width || !dims.height) return { width: maxWidth, height: maxHeight };
  const ratio = Math.min(maxWidth / dims.width, maxHeight / dims.height);
  return { width: Math.round(dims.width * ratio), height: Math.round(dims.height * ratio) };
}

function fullWidthImage(filePath, maxWidth){
  const data = fs.readFileSync(filePath);
  const dims = getImageDimensions(data);
  const box = scaledImageBox(dims, maxWidth, 999999);
  return new ImageRun({ data, transformation: box, type: 'png' });
}

function dataUrlToBuffer(dataUrl){
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if(!match) return null;
  return { buffer: Buffer.from(match[2], 'base64'), type: match[1] === 'jpg' ? 'jpeg' : match[1] };
}

function signatureImageOrBlank(dataUrl, maxWidth, maxHeight){
  const parsed = dataUrlToBuffer(dataUrl);
  if(!parsed) return new TextRun({ text: '_______________________________', size: 20 });
  const dims = getImageDimensions(parsed.buffer);
  const box = scaledImageBox(dims, maxWidth, maxHeight);
  try{
    return new ImageRun({ data: parsed.buffer, transformation: box, type: parsed.type === 'webp' ? 'png' : parsed.type });
  }catch(err){
    return new TextRun({ text: '_______________________________', size: 20 });
  }
}

function fieldRow(label, value){
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text: label + ' ', bold: true, size: 20 }),
      new TextRun({ text: value || '', size: 20, underline: {} })
    ]
  });
}

function sectionTitle(text){
  return new Paragraph({
    spacing: { before: 200, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: 'EEF2F6' },
    children: [new TextRun({ text, bold: true, size: 21 })]
  });
}

function checkboxLine(checked, label){
  return new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: (checked ? '☑ ' : '☐ ') + label, size: 20 })]
  });
}

function fmtDate(s){
  if(!s) return '';
  const d = new Date(s + 'T00:00:00');
  if(isNaN(d)) return s;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function linesParagraphs(text, minLines){
  const content = text ? String(text).split('\n') : [];
  const total = Math.max(minLines, content.length);
  const out = [];
  for(let i = 0; i < total; i++){
    out.push(new Paragraph({
      spacing: { after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' } },
      children: [new TextRun({ text: content[i] || ' ', size: 20 })]
    }));
  }
  return out;
}

function statusTable(statusRows){
  const headerRow = new TableRow({
    children: ['Indicator', 'Yes', 'No', 'Remarks'].map((h, i) => new TableCell({
      width: { size: i === 0 ? 50 : i === 3 ? 25 : 8, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: 'F0F0F0' },
      borders: CELL_BORDERS,
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })]
    }))
  });
  const dataRows = statusRows.map((r, i) => new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${r.label || ''}`, size: 19 })] })] }),
      new TableCell({ borders: CELL_BORDERS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.yes ? '☑' : '☐', size: 19 })] })] }),
      new TableCell({ borders: CELL_BORDERS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.no ? '☑' : '☐', size: 19 })] })] }),
      new TableCell({ borders: CELL_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: r.remarks || '', size: 19 })] })] })
    ]
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] });
}

function signatureBlock(d){
  const benCell = new TableCell({
    borders: NO_BORDERS,
    width: { size: 50, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: 'BENEFICIARY', bold: true, size: 19 })] }),
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Name: ' + (d.ben_name || ''), size: 19 })] }),
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Signature: ', size: 19 }), signatureImageOrBlank(d.ben_signature, 180, 55)] }),
      new Paragraph({ children: [new TextRun({ text: 'Date: ' + fmtDate(d.ben_date), size: 19 })] })
    ]
  });
  const officerCell = new TableCell({
    borders: NO_BORDERS,
    width: { size: 50, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: 'MONITORING OFFICER', bold: true, size: 19 })] }),
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Name: ' + (d.officer_name || ''), size: 19 })] }),
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Position: ' + (d.officer_position || ''), size: 19 })] }),
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Signature: ', size: 19 }), signatureImageOrBlank(d.officer_signature_data, 180, 55)] }),
      new Paragraph({ children: [new TextRun({ text: 'Date: ' + fmtDate(d.officer_date), size: 19 })] })
    ]
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [benCell, officerCell] })] });
}

async function buildDocxBuffer(d){
  const challengeList = ['Lack of Capital', 'Low Sales', 'Lack of Customers', 'Health Problems', 'Natural Disaster', 'Lack of Skills', 'Family Problems'];
  const needsList = ['Additional Capital', 'Skills Training', 'Marketing Assistance', 'Financial Literacy', 'Business Coaching'];
  const statusOptions = ['Operating Well', 'Operating but Needs Assistance', 'Temporarily Closed', 'Permanently Closed'];

  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [fullWidthImage(HEADER_IMG_PATH, PAGE_CONTENT_WIDTH_PX)] }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '111111' } },
      spacing: { after: 200 },
      children: []
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: 'LIVELIHOOD ASSISTANCE MONITORING FORM', bold: true, size: 26, underline: {} })]
    }),

    fieldRow('Program:', d.program),
    fieldRow('Date of Monitoring:', fmtDate(d.date_monitoring)),
    fieldRow('Name of Beneficiary:', d.name),
    fieldRow('Address:', d.address),
    fieldRow('Contact Number:', d.contact),
    fieldRow('Type of Livelihood Assistance Received:', d.assistance_type),
    fieldRow('Date Assistance was Released:', fmtDate(d.date_released)),
    fieldRow('Amount/Value of Assistance:', d.amount),
    fieldRow('Monitored By:', d.monitored_by),

    sectionTitle('I. STATUS OF LIVELIHOOD'),
    statusTable(d.statusRows || []),

    sectionTitle('II. BUSINESS INFORMATION'),
    fieldRow('Type of Business:', d.biz_type),
    fieldRow('Average Daily Sales:', d.daily_sales),
    fieldRow('Average Monthly Income:', d.monthly_income),
    fieldRow('No. of Household Members Benefiting:', d.household_members),
    new Paragraph({ spacing: { before: 100, after: 60 }, children: [new TextRun({ text: 'Current Status:', bold: true, size: 20 })] }),
    ...statusOptions.map(s => checkboxLine(d.current_status === s, s)),
    fieldRow('Reason (if closed):', d.closed_reason),

    sectionTitle('III. CHALLENGES ENCOUNTERED'),
    ...challengeList.map(c => checkboxLine((d.challenges || []).includes(c), c)),
    checkboxLine(!!d.challenges_other, 'Others: ' + (d.challenges_other || '')),

    sectionTitle('IV. ASSISTANCE NEEDED'),
    ...needsList.map(c => checkboxLine((d.needs || []).includes(c), c)),
    checkboxLine(!!d.needs_other, 'Other: ' + (d.needs_other || '')),

    sectionTitle('V. OBSERVATIONS OF THE MONITORING OFFICER'),
    ...linesParagraphs(d.observations, 3),

    sectionTitle('VI. RECOMMENDATIONS'),
    ...linesParagraphs(d.recommendations, 3),

    sectionTitle("BENEFICIARY'S FEEDBACK"),
    new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'How has the livelihood assistance helped your family?', italics: true, size: 19 })] }),
    ...linesParagraphs(d.feedback, 3),

    new Paragraph({ spacing: { before: 300, after: 200 }, children: [] }),
    signatureBlock(d),

    new Paragraph({ spacing: { before: 300 }, alignment: AlignmentType.CENTER, children: [fullWidthImage(FOOTER_IMG_PATH, PAGE_CONTENT_WIDTH_PX)] })
  ];

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
      children
    }]
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildDocxBuffer };
