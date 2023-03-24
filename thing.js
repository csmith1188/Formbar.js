const excelToJson = require('convert-excel-to-json');

    const result = excelToJson({
        sourceFile: 'basicjavascript.xlsx',
        sheets:[{
            name: 'Steps',
            columnToKey: {
                A: 'index',
                B: 'type',
                C:'prompt',
                D:'objective'
            }
        }]
    });

