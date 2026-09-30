import { AlignmentType, BorderStyle, Document, Footer, Header, LevelFormat, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { BrdLine, BrdSections } from "@/lib/db/schema";
import { formatDateLong } from "@/lib/core/dates";
import { cleanStyle } from "@/lib/core/style";
import { BRD_SECTIONS, LINE_SECTIONS } from "@/lib/brd/draft";

/**
 * The BRD draft as a Word file on the same paper as the MOM: Times New Roman, navy headings over gold rules, numbered
 * sections, requirement tables with ID, requirement and source, a small header and a confidential footer. Every string
 * goes through cleanStyle so no hyphen or dash punctuation reaches the document.
 */

const FONT = "Times New Roman";
const NAVY = "1F3864";
const INK = "222222";
const GOLD = "C9A227";
const GREY = "555555";
const RULE = "BFBFBF";
const RULE_LIGHT = "D9D9D9";
const ROW_ALT = "F2F2F2";

export type BrdDocInput = {
  clientCode: string;
  clientName: string;
  project: string;
  version: number;
  date: Date;
  meetingsRead: number;
  sections: BrdSections;
  /** Item id to "Meeting title, 29 Sep 2026, 1:34". */
  sources: Map<string, string>;
};

function run(text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}): TextRun {
  return new TextRun({ text: cleanStyle(text), font: FONT, bold: opts.bold, italics: opts.italics, color: opts.color ?? INK, size: opts.size ?? 19 });
}

function heading(text: string): Paragraph {
  return new Paragraph({ spacing: { before: 200, after: 70 }, border: { bottom: { style: BorderStyle.SINGLE, color: GOLD, size: 8, space: 2 } }, children: [run(text, { bold: true, color: NAVY, size: 22 })] });
}

function body(text: string): Paragraph {
  return new Paragraph({ spacing: { after: 90 }, children: [run(text)] });
}

function bullet(text: string): Paragraph {
  return new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 50 }, children: [run(text)] });
}

function none(): Paragraph {
  return new Paragraph({ spacing: { after: 90 }, children: [run("None recorded.", { italics: true, color: GREY })] });
}

function cell(text: string, width: number, opts: { header?: boolean; alt?: boolean; small?: boolean } = {}): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: opts.header ? NAVY : opts.alt ? ROW_ALT : "FFFFFF" },
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ spacing: { after: 0 }, children: [run(text, { bold: opts.header, color: opts.header ? "FFFFFF" : opts.small ? GREY : INK, size: opts.header ? 17 : opts.small ? 15 : 17 })] })],
  });
}

function table(columns: number[], header: string[], rows: string[][], smallLast = false): Table {
  const border = (color: string) => ({ style: BorderStyle.SINGLE, color, size: 4 });
  return new Table({
    width: { size: columns.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: columns,
    borders: { top: border(RULE), bottom: border(RULE), left: border(RULE), right: border(RULE), insideHorizontal: border(RULE_LIGHT), insideVertical: border(RULE_LIGHT) },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, columns[i], { header: true })) }),
      ...rows.map((r, n) => new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v, columns[i], { alt: n % 2 === 1, small: smallLast && i === r.length - 1 })) })),
    ],
  });
}

function lineRows(lines: BrdLine[], sources: Map<string, string>): string[][] {
  return lines.map((l) => [l.id, l.text, Array.from(new Set(l.itemIds.map((id) => sources.get(id)).filter(Boolean))).join("; ")]);
}

export function brdDocument(input: BrdDocInput): Document {
  const title = `${input.clientCode} × Fero | Business Requirements Document`;
  const children: (Paragraph | Table)[] = [
    new Paragraph({ spacing: { after: 40 }, children: [run(title, { bold: true, color: NAVY, size: 28 })] }),
    new Paragraph({
      spacing: { after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, color: GOLD, size: 12, space: 4 } },
      children: [run(`Draft v${input.version}  |  ${formatDateLong(input.date)}  |  Built from ${input.meetingsRead} ${input.meetingsRead === 1 ? "meeting" : "meetings"}`, { italics: true, color: GREY })],
    }),
  ];
  const s = input.sections;
  BRD_SECTIONS.forEach((sec, i) => {
    children.push(heading(`${i + 1}. ${sec.title}`));
    const v = s[sec.key];
    if (typeof v === "string") children.push(v.trim() ? body(v) : none());
    else if (sec.key === "stakeholders") {
      const ppl = v as BrdSections["stakeholders"];
      children.push(ppl.length ? table([3000, 4400, 1600], ["Name", "Role", "Side"], ppl.map((p) => [p.name, p.role, p.side])) : none());
    } else if (LINE_SECTIONS.some((l) => l.key === sec.key)) {
      const lines = v as BrdLine[];
      children.push(lines.length ? table([700, 5600, 2700], ["ID", "Requirement", "Source"], lineRows(lines, input.sources), true) : none());
    } else {
      const list = v as string[];
      if (list.length) children.push(...list.map(bullet));
      else children.push(none());
    }
  });

  return new Document({
    creator: "Orbit",
    title,
    styles: { default: { document: { run: { font: FONT, size: 19, color: INK } } } },
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 180 } } } }] }] },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 700, right: 720, bottom: 600, left: 720, header: 708, footer: 708, gutter: 0 } } },
        headers: {
          default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, color: GOLD, size: 6, space: 4 } }, children: [run(`${input.project} | Business Requirements Document`, { color: NAVY, size: 17 })] })] }),
        },
        footers: {
          default: new Footer({ children: [new Paragraph({ spacing: { before: 40 }, border: { top: { style: BorderStyle.SINGLE, color: GOLD, size: 6, space: 4 } }, children: [run("Confidential | Internal Use Only", { italics: true, color: "808080", size: 13 })] })] }),
        },
        children,
      },
    ],
  });
}

export async function buildBrdDocx(input: BrdDocInput): Promise<Buffer> {
  return Packer.toBuffer(brdDocument(input));
}
