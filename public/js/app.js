const busca = document.getElementById('busca');
if (busca) {
  const cards = [...document.querySelectorAll('.produto')];
  const contador = document.getElementById('contador');
  busca.addEventListener('input', () => {
    const q = busca.value.toLowerCase().trim(); let n = 0;
    cards.forEach(card => { const ok = card.dataset.text.includes(q); card.hidden = !ok; if (ok) n++; });
    contador.textContent = `${n} produto(s)`;
  });
}
const input = document.getElementById('imagens');
const preview = document.getElementById('preview');
const fileInfo = document.getElementById('fileInfo');
if (input) input.addEventListener('change', () => {
  preview.innerHTML = '';
  if (input.files.length > 3) { fileInfo.textContent = 'Selecione no máximo 3 imagens.'; input.value=''; return; }
  fileInfo.textContent = `${input.files.length} imagem(ns) selecionada(s)`;
  [...input.files].forEach(file => { const img = document.createElement('img'); img.src = URL.createObjectURL(file); preview.appendChild(img); });
});
