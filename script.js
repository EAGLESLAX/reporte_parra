const URL_GAS = "https://script.google.com/macros/s/TU_ID_AQUI/exec";

function ejecutar() {
  document.getElementById("resultado").innerText = "Ejecutando...";

  fetch(URL_GAS, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      accion: "prueba",
      usuario: "Fer"
    })
  })
  .then(res => res.text())
  .then(data => {
    document.getElementById("resultado").innerText = data;
  })
  .catch(err => {
    document.getElementById("resultado").innerText = "Error: " + err;
  });
}
