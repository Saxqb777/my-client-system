import { AlignmentType, BorderStyle, Document, Footer, Header, LevelFormat, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { MinutesDoc } from "@/lib/core/minutes";
import { momDateLine, momHeading } from "@/lib/core/minutes";

/**
 * The Word version of the minutes, built to match the ADFH x Fero Maqta Pay MOM Saaqib approved:
 * Times New Roman, navy headings over a gold rule, bullet points with a bold topic, an action table
 * with a navy header row and alternating grey rows, a small header and a confidential footer.
 * Sizes are half points and twentieths of a point, exactly as in the example file.
 */

const FONT = "Times New Roman";
const NAVY = "1F3864";
const INK = "222222";
const TOPIC = "12233F";
const GOLD = "C9A227";
const GREY = "555555";
const RULE = "BFBFBF";
const RULE_LIGHT = "D9D9D9";
const ROW_ALT = "F2F2F2";

const CELL_MARGINS = { top: 35, bottom: 35, left: 80, right: 80 };
const COLUMNS = [520, 5200, 2000];

function run(text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}): TextRun {
  return new TextRun({ text, font: FONT, bold: opts.bold, italics: opts.italics, color: opts.color ?? INK, size: opts.size ?? 18 });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 130, after: 55 },
    border: { bottom: { style: BorderStyle.SINGLE, color: GOLD, size: 8, space: 2 } },
    children: [run(text, { bold: true, color: NAVY, size: 21 })],
  });
}

function body(text: string): Paragraph {
  return new Paragraph({ spacing: { after: 90 }, children: [run(text)] });
}

function point(topic: string, text: string): Paragraph {
  const children = topic.trim() ? [run(`${topic.trim()}: `, { bold: true, color: TOPIC }), run(text.trim())] : [run(text.trim())];
  return new Paragraph({ style: "ListParagraph", numbering: { reference: "points", level: 0 }, spacing: { after: 65 }, children });
}

function cell(text: string, width: number, opts: { header?: boolean; alt?: boolean }): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: opts.header ? NAVY : opts.alt ? ROW_ALT : "FFFFFF" },
    margins: CELL_MARGINS,
    children: [new Paragraph({ spacing: { after: 0 }, children: [run(text, { bold: opts.header, color: opts.header ? "FFFFFF" : INK, size: 17 })] })],
  });
}

function actionTable(actions: MinutesDoc["actions"]): Table {
  const border = (color: string) => ({ style: BorderStyle.SINGLE, color, size: 4 });
  const rows = [
    new TableRow({ tableHeader: true, children: [cell("#", COLUMNS[0], { header: true }), cell("Action", COLUMNS[1], { header: true }), cell("Owner", COLUMNS[2], { header: true })] }),
    ...actions.map(
      (a, i) =>
        new TableRow({
          cantSplit: true,
          children: [cell(String(i + 1), COLUMNS[0], { alt: i % 2 === 1 }), cell(a.text, COLUMNS[1], { alt: i % 2 === 1 }), cell(a.owner ?? "", COLUMNS[2], { alt: i % 2 === 1 })],
        }),
    ),
  ];
  return new Table({
    width: { size: COLUMNS.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: COLUMNS,
    borders: { top: border(RULE), bottom: border(RULE), left: border(RULE), right: border(RULE), insideHorizontal: border(RULE_LIGHT), insideVertical: border(RULE_LIGHT) },
    rows,
  });
}

export function momDocument(doc: MinutesDoc): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ spacing: { after: 40 }, children: [run(momHeading(doc.clientCode, doc.title), { bold: true, color: NAVY, size: 26 })] }),
    new Paragraph({
      spacing: { after: 130 },
      border: { bottom: { style: BorderStyle.SINGLE, color: GOLD, size: 12, space: 4 } },
      children: [run(momDateLine(doc.heldAt, doc.location), { italics: true, color: GREY })],
    }),
    sectionHeading("Meeting Objective"),
    body(doc.objective.trim() || " "),
    sectionHeading("Discussion Points"),
    ...doc.points.filter((p) => p.text.trim()).map((p) => point(p.topic, p.text)),
    sectionHeading("Action Points"),
  ];
  if (doc.actions.length) children.push(actionTable(doc.actions));
  else children.push(body("No actions were recorded."));

  return new Document({
    creator: "Orbit",
    title: momHeading(doc.clientCode, doc.title),
    styles: {
      default: { document: { run: { font: FONT, size: 18, color: INK } } },
      paragraphStyles: [{ id: "ListParagraph", name: "List Paragraph", basedOn: "Normal", quickFormat: true }],
    },
    numbering: {
      config: [
        {
          reference: "points",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 180 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 700, right: 720, bottom: 600, left: 720, header: 708, footer: 708, gutter: 0 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 40 },
                border: { bottom: { style: BorderStyle.SINGLE, color: GOLD, size: 6, space: 4 } },
                children: [run(`${doc.project} | ${doc.title}`, { color: NAVY, size: 17 })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                spacing: { before: 40 },
                border: { top: { style: BorderStyle.SINGLE, color: GOLD, size: 6, space: 4 } },
                children: [run("Confidential | Internal Use Only", { italics: true, color: "808080", size: 13 })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

export async function buildMomDocx(doc: MinutesDoc): Promise<Buffer> {
  return Packer.toBuffer(momDocument(doc));
}
