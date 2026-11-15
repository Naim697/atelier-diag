# Atelier diag

Recherche de panne automobile à partir des codes défaut, pensée pour le téléphone à l'atelier.
Tout fonctionne hors ligne : les codes, le diagnostic et les cas sont stockés dans le téléphone.

## Ce que fait l'appli

- Saisie libre ou dictée : codes, véhicule, kilométrage et symptômes en une phrase.
- Pistes classées et plan de contrôles du moins cher au plus cher ; chaque résultat (bon, mauvais) reclasse les pistes.
- Tes cas résolus sont consultés en premier, puis les pannes connues du moteur, puis la base de codes.
- 24 660 fiches de codes en paquets importables et mis à jour sans toucher aux cas.
- Photos jointes aux fiches, sauvegarde complète en un fichier, import avec fusion.
- Règle fixe : jamais de suppression de FAP, d'EGR ou d'AdBlue (voir `src/core/guard.ts`).

## Commandes

```
npm install
npm run packs    # régénère public/packs à partir de legacy/bases-codes-v1.json.gz
npm test         # tests unitaires
npm run build    # appli installable dans dist/
npm run e2e      # essai complet dans Chrome (après build)
npm run single   # version fichier unique dans dist-single/
```

## Organisation

- `src/core` : lecture des codes, classification, bibliothèque de contrôles, moteur de diagnostic, règle antipollution.
- `src/data/pannes-connues.ts` : pannes connues par moteur.
- `src/db` : stockage IndexedDB, paquets, sauvegarde et import.
- `src/ui` : interface.
- `scripts` : fabrication des paquets et traductions.
- `legacy` : ancien outil et bases d'origine.

Format des paquets : voir `PAQUETS.md`.
