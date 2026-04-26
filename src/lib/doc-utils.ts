export function buildHtmlDoc(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8"/>
  <meta name=ProgId content=Word.Document/>
  <meta name=Generator content="Microsoft Word 15"/>
  <title>${title}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page {
      size: 210mm 297mm;
      margin: 20mm 20mm 20mm 25mm;
      mso-header-margin: 0;
      mso-footer-margin: 0;
    }
    body {
      font-family: "Times New Roman", serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #000;
    }
    table { border-collapse: collapse; width: 100%; }
    td { padding: 3pt 4pt; vertical-align: top; }
    .page-break { page-break-after: always; mso-special-character: line-break; }
    b, strong { font-weight: bold; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .justify { text-align: justify; }
    .section-header { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 2pt; }
    .sign-line { border-top: 1px solid #000; display: inline-block; min-width: 150pt; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

export function downloadDocx(filename: string, html: string) {
  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function openPrintWindow(title: string, bodyHtml: string) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 20mm 20mm 20mm 25mm; }
    body { margin:0; font-family:"Times New Roman",serif; font-size:12pt; color:#000; }
    table { border-collapse:collapse; width:100%; }
    td { padding:3pt 4pt; vertical-align:top; }
    .page-break { page-break-after:always; display:block; height:0; margin:0; border:none; }
    .center { text-align:center; }
    .bold { font-weight:bold; }
    .justify { text-align:justify; }
    .section-header { font-weight:bold; border-bottom:1px solid #000; padding-bottom:2pt; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}