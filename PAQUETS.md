# Format d'un paquet de codes

Un paquet est un fichier JSON (éventuellement compressé en `.json.gz`) :

```json
{
  "format": "atelier-diag-pack",
  "id": "mon-paquet",
  "name": "Nom affiché",
  "version": "2026.12.1",
  "license": "licence des données",
  "source": "origine des données",
  "lang": "fr",
  "entries": [
    {
      "code": "P0299",
      "t": "titre d'origine",
      "tf": "titre français",
      "d": "description",
      "k": ["composants"],
      "cs": [["cause", 3], ["autre cause", 1]],
      "s": ["symptômes"],
      "x": ["codes liés"]
    }
  ]
}
```

- `id` : minuscules, chiffres et tirets. Réimporter un paquet de même `id` remplace l'ancien.
- `cs` : causes avec leur fréquence, 3 fréquente, 2 possible, 1 rare.
- Seul `code` est obligatoire dans une fiche.
- À l'import, toute phrase proposant de supprimer FAP, EGR ou AdBlue est retirée.
- Import depuis l'appli : onglet Codes, « Paquets installés ».
