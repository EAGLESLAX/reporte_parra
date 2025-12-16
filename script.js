/**
 * doGet sirve la UI
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Procesador de Ventas');
}

/**
 * Procesa JSON que viene del cliente (headers + rows como objetos)
 * Crea un Spreadsheet temporal con BaseDatos y Resumen, lo exporta a XLSX,
 * borra el Spreadsheet temporal y devuelve el XLSX en base64 + la tabla resumen (array de arrays).
 *
 * payload = {
 *   headers: [...],
 *   rows: [ { header1: val, header2: val, ... }, ... ]
 * }
 */
function procesarJSON(payload) {
  try {
    if (!payload || !payload.headers || !payload.rows) {
      throw new Error('Payload inválido. Debe contener headers y rows.');
    }

    var headers = payload.headers;
    var rowsObjects = payload.rows;

    // === 1) Crear arrays para BaseDatos (AOA) ===
    var baseData = [];
    baseData.push(headers);
    rowsObjects.forEach(function (r) {
      var row = headers.map(function (h) { return r[h] === undefined || r[h] === null ? '' : r[h]; });
      baseData.push(row);
    });

    // === 2) Generar resumen por "Usuario Trx" ===
    var resumenMap = {}; // usuario -> { total, amexMonto, movs }
    rowsObjects.forEach(function (r) {
      var usuario = (r['Usuario Trx'] === undefined || r['Usuario Trx'] === null) ? '' : String(r['Usuario Trx']).trim();
      if (!usuario) return;
      var importe = limpiarImporte(r['Importe']);
      var tipo = (r['Tipo Tarjeta'] || '').toString().trim();

      if (!resumenMap[usuario]) resumenMap[usuario] = { total: 0, amexMonto: 0, movs: 0 };
      resumenMap[usuario].total += importe;
      if (tipo === 'CREDITO/AMEXBANK/AMEX') {
    resumenMap[usuario].amexMonto += importe;
    resumenMap[usuario].movs += 1;
}
    });

    // === 3) Armar tabla resumen (AOA) ===
    var resumenAOA = [];
    resumenAOA.push(['Usuario Trx', 'Total ventas', 'Monto AMEX', 'Movimientos', 'Tipo Tarjeta']);
    for (var u in resumenMap) {
      var rec = resumenMap[u];
      var tipoTarj = (rec.amexMonto > 0) ? 'CREDITO/AMEXBANK/AMEX' : 'OTRAS';
      resumenAOA.push([u, Number(rec.total).toFixed(2), Number(rec.amexMonto).toFixed(2), rec.movs, tipoTarj]);
    }

    // === 4) Crear Spreadsheet temporal y escribir hojas ===
    var ss = SpreadsheetApp.create('TEMP_REPORTE_' + new Date().getTime());
    // BaseDatos
    var shBase = ss.getSheets()[0];
    shBase.setName('BaseDatos');
    shBase.getRange(1, 1, baseData.length, baseData[0].length).setValues(baseData);

    // Resumen
    var shResumen = ss.insertSheet('Resumen');
    shResumen.getRange(1, 1, resumenAOA.length, resumenAOA[0].length).setValues(resumenAOA);

    // === 5) Exportar Spreadsheet a XLSX usando URL oficial ===
    var url = 'https://docs.google.com/spreadsheets/export?format=xlsx&id=' + ss.getId();
    var token = ScriptApp.getOAuthToken();
    var response = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      // attempt to clean up before throwing
      try { DriveApp.getFileById(ss.getId()).setTrashed(true); } catch (e) {}
      throw new Error('Error exportando XLSX: HTTP ' + response.getResponseCode());
    }

    var blob = response.getBlob().setName('REPORTE_RESUMEN.xlsx');

    // Convertir a base64
    var fileBase64 = Utilities.base64Encode(blob.getBytes());

    // Eliminar el spreadsheet temporal
    try {
      DriveApp.getFileById(ss.getId()).setTrashed(true);
    } catch (e) {
      // no crítico
    }

    return {
      tabla: resumenAOA,
      fileBase64: fileBase64,
      filename: 'REPORTE_RESUMEN.xlsx'
    };

  } catch (err) {
    return { error: err.toString() };
  }
}

/**
 * Convierte distintos formatos de importe a número (ej: "$ 1,234.56", "1234.56", 1234)
 */
function limpiarImporte(valor) {
  if (valor === undefined || valor === null) return 0;
  if (typeof valor === 'number') return valor;
  var s = String(valor).trim();
  if (s === '') return 0;
  // Eliminar $ y espacios y comas de miles
  s = s.replace(/\$/g, '').replace(/\s/g, '').replace(/,/g, '');
  var n = parseFloat(s);
  if (isNaN(n)) return 0;
  return n;
}
