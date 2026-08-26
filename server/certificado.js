import PDFDocument from "pdfkit";

/* Genera el certificado en PDF. Refleja el mismo documento que el
   investigador ve en pantalla en el paso 04. */

const INK = "#16181C";
const SOFT = "#5C6068";
const RULE = "#C3C6BC";
const BLUE = "#2E3A8C";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function fechaLarga(d = new Date()) {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function nombreArchivo({ cotejo, caseNo, piName }) {
  const persona = (piName || "investigador")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `Certificado-${cotejo}-${caseNo}-${persona}.pdf`;
}

/* Texto centrado con espaciado entre letras, que pdfkit no centra bien
   por sí solo cuando se usa characterSpacing. */
function centrado(doc, texto, y, { size, font, color, spacing = 0, ancho }) {
  doc.font(font).fontSize(size).fillColor(color);
  const w = doc.widthOfString(texto, { characterSpacing: spacing });
  const x = doc.page.margins.left + (ancho - w) / 2;
  doc.text(texto, x, y, { lineBreak: false, characterSpacing: spacing });
  return y + doc.currentLineHeight();
}

export function construirCertificado({ cotejo, descripcion, piName, proposalTitle, caseNo }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 54 });
  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const izq = doc.page.margins.left;

  // Marco del documento
  doc.lineWidth(2).strokeColor(INK)
    .rect(36, 36, doc.page.width - 72, doc.page.height - 72).stroke();

  /* Arranque bajo para que el bloque quede ópticamente centrado en la hoja.
     Con títulos largos el texto crece hacia abajo y sigue cabiendo. */
  let y = 140;

  y = centrado(doc, "UNIVERSIDAD DE PUERTO RICO · RECINTO DE CIENCIAS MÉDICAS", y,
    { size: 9, font: "Helvetica-Bold", color: SOFT, spacing: 1.6, ancho });
  y = centrado(doc, "DECANATO DE INVESTIGACIÓN", y + 2,
    { size: 9, font: "Helvetica-Bold", color: SOFT, spacing: 1.6, ancho });

  y += 34;
  y = centrado(doc, "CERTIFICADO DE CUMPLIMIENTO", y,
    { size: 26, font: "Helvetica-Bold", color: INK, spacing: 1.2, ancho });
  y = centrado(doc, `COTEJO ${cotejo}`, y + 6,
    { size: 15, font: "Helvetica-Bold", color: BLUE, spacing: 2.4, ancho });

  // Filete
  y += 26;
  doc.lineWidth(1.5).strokeColor(INK)
    .moveTo(izq + ancho / 2 - 34, y).lineTo(izq + ancho / 2 + 34, y).stroke();
  y += 30;

  y = centrado(doc, "Se certifica que la propuesta", y,
    { size: 11.5, font: "Times-Italic", color: SOFT, ancho });

  y += 10;
  doc.font("Times-Bold").fontSize(17).fillColor(INK);
  doc.text(proposalTitle, izq + 40, y, { width: ancho - 80, align: "center" });
  y = doc.y + 18;

  y = centrado(doc, "sometida por", y,
    { size: 11.5, font: "Times-Italic", color: SOFT, ancho });

  y += 10;
  doc.font("Helvetica-Bold").fontSize(23).fillColor(INK);
  doc.text(piName, izq + 20, y, { width: ancho - 40, align: "center" });
  y = doc.y + 22;

  doc.font("Times-Roman").fontSize(11.5).fillColor(INK);
  doc.text(descripcion, izq + 46, y, {
    width: ancho - 92, align: "center", lineGap: 2.5,
  });
  y = doc.y + 30;

  // Pie: expediente y fecha
  doc.lineWidth(0.8).strokeColor(RULE)
    .moveTo(izq + 20, y).lineTo(izq + ancho - 20, y).stroke();
  y += 12;

  doc.font("Helvetica-Bold").fontSize(8).fillColor(SOFT);
  doc.text("EXPEDIENTE", izq + 20, y, { characterSpacing: 1, lineBreak: false });
  doc.text("FECHA DE EMISIÓN", izq + 20, y,
    { width: ancho - 40, align: "right", characterSpacing: 1, lineBreak: false });

  doc.font("Helvetica").fontSize(11).fillColor(INK);
  doc.text(caseNo, izq + 20, y + 12, { lineBreak: false });
  doc.text(fechaLarga(), izq + 20, y + 12, { width: ancho - 40, align: "right", lineBreak: false });

  y += 42;
  doc.font("Times-Italic").fontSize(8.5).fillColor(SOFT);
  doc.text(
    "Documento generado por cotejo automatizado como ayuda de triaje. No sustituye la atestación " +
    "del investigador principal ni la certificación del ICDGOF.",
    izq + 46, y, { width: ancho - 92, align: "center", lineGap: 1.5 }
  );

  doc.end();
  return doc;
}
