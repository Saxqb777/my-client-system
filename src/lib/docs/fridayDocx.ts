import { AlignmentType, BorderStyle, Document, Footer, Header, Packer, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { ReportRow } from "@/lib/db/schema";
import { FRIDAY_COLUMNS, weekLabel } from "@/lib/friday/build";

/** The Friday pack as a Word table: landscape A4, the seven fixed columns, same navy and gold paper as the MOM. */

const FONT = "Times New Roman";
const NAVY = "1F3864";
const INK = "222222";
const GOLD = "C9A227";
const GREY = "555555";
const RULE = "BFBFBF";
const RULE_LIGHT = "D9D9D9";
const ROW_ALT = "F2F2F2";
const WIDTHS = [1900, 1000, 3900, 3500, 3500, 1000, 1000];

function run(text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}): TextRun {
  return new TextRun({ text, font: FONT, bold: opts.bold, italics: opts.italics, color: opts.color ?? INK, size: opts.size ?? 16 });
}

function cell(text: string, width: number, opts: { header?: boolean; alt?: boolean; bold?: boolean } = {}): TableCell {
  const lines = text.split(/\n+/).filter(Boolean);
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: opts.header ? NAVY : opts.alt ? ROW_ALT : "FFFFFF" },
    margins: { top: 45, bottom: 45, left: 80, right: 80 },
    children: (lines.length ? lines : [""]).map((l) => new Paragraph({ spacing: { after: 0 }, children: [run(l, { bold: opts.header || opts.bold, color: opts.header ? "FFFFFF" : INK, size: opts.header ? 16 : 15 })] })),
  });
}

export function fridayDocument(input: { weekStart: string; weekEnd: string; rows: ReportRow[]; status: string }): Document {
  const border = (color: string) => ({ style: BorderStyle.SINGLE, color, size: 4 });
  const header = new TableRow({ tableHeader: true, children: FRIDAY_COLUMNS.map((c, i) => cell(c.label, WIDTHS[i], { header: true })) });
  const body = input.rows.map(
    (r, i) =>
      new TableRow({
        cantSplit: true,
        children: FRIDAY_COLUMNS.map((c, j) => cell(String(r[c.key] ?? ""), WIDTHS[j], { alt: i % 2 === 1, bold: c.key === "client" })),
      }),
  );
  const table = new Table({
    width: { size: WIDTHS.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: WIDTHS,
    borders: { top: border(RULE), bottom: border(RULE), left: border(RULE), right: border(RULE), insideHorizontal: border(RULE_LIGHT), insideVertical: border(RULE_LIGHT) },
    rows: [header, ...body],
  });
  const title = `Weekly client status | ${weekLabel(input.weekStart, input.weekEnd)}`;
  return new Document({
    creator: "Orbit",
    title,
    styles: { default: { document: { run: { font: FONT, size: 16, color: INK } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 16838, height: 11906, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 700, right: 720, bottom: 600, left: 720, header: 500, footer: 500, gutter: 0 },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, color: GOLD, size: 6, space: 4 } }, children: [run("Fero | Weekly client status", { color: NAVY, size: 16 })] })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ spacing: { before: 40 }, border: { top: { style: BorderStyle.SINGLE, color: GOLD, size: 6, space: 4 } }, children: [run("Confidential | Internal Use Only", { italics: true, color: "808080", size: 13 })] })],
          }),
        },
        children: [
          new Paragraph({ spacing: { after: 40 }, children: [run("Weekly client status", { bold: true, color: NAVY, size: 26 })] }),
          new Paragraph({
            spacing: { after: 140 },
            border: { bottom: { style: BorderStyle.SINGLE, color: GOLD, size: 12, space: 4 } },
            children: [run(`Week ${weekLabel(input.weekStart, input.weekEnd)}  |  ${input.rows.length} ${input.rows.length === 1 ? "client" : "clients"}${input.status === "final" ? "  |  Final" : "  |  Draft"}`, { italics: true, color: GREY })],
          }),
          table,
        ],
      },
    ],
  });
}

export async function buildFridayDocx(input: { weekStart: string; weekEnd: string; rows: ReportRow[]; status: string }): Promise<Buffer> {
  return Packer.toBuffer(fridayDocument(input));
}
