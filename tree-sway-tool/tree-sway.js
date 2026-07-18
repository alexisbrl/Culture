// tree-sway.js — optionnel.
// N'est utile QUE si tu ajoutes des arbres dynamiquement en JS (sans passer
// par le fragment HTML généré) : il assigne un déphasage, une amplitude et
// une vitesse aléatoires à chaque .tree-sway qui n'en a pas déjà, pour
// éviter un balancement identique/synchronisé entre tous les arbres.
// Si tu utilises snippets.html tel quel, ce fichier n'est pas nécessaire.
(function () {
  document.querySelectorAll('.tree-sway').forEach(function (el) {
    if (!el.style.getPropertyValue('--sway-delay')) {
      el.style.setProperty('--sway-delay', (Math.random() * -4.5).toFixed(2) + 's');
    }
    if (!el.style.getPropertyValue('--sway-drift')) {
      el.style.setProperty('--sway-drift', (0.85 + Math.random() * 0.3).toFixed(2));
    }
    if (!el.style.getPropertyValue('--sway-amp')) {
      el.style.setProperty('--sway-amp', (0.75 + Math.random() * 0.55).toFixed(2));
    }
  });
})();
