const xlsx = require('xlsx');

// cellDates flag parses dates, cellNF parses number formats, cellFormula allows viewing formulas
const workbook = xlsx.readFile('vema reference.xlsx', { cellFormula: true, cellDates: true });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

for (let r = 0; r < Math.min(20, data.length); r++) {
    const row = data[r];
    for (let c = 0; c < Math.min(20, row.length); c++) {
        const cellAddress = xlsx.utils.encode_cell({ r, c });
        const cell = sheet[cellAddress];
        if (cell && cell.f) {
            console.log(`Cell ${cellAddress} formula: ${cell.f}`);
        }
    }
}
console.log("Done checking formulas.");
