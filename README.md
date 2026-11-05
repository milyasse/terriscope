# TerriScope

**Intelligence territoriale. Décisions stratégiques.**

Plateforme de géoanalytique en cours de développement, centrée d'abord sur le Maroc. Elle mesure la couverture territoriale, compare des emplacements et analyse des zones de chalandise.

> **État actuel : démo sur données fictives.** Les contours des régions sont schématiques et aucun chiffre n'est une statistique officielle. Le calcul par temps de trajet n'est pas encore disponible, faute de moteur de routage connecté.

## Démarrer

Prérequis : Node.js 22 ou plus récent.

```bash
npm install
npm run dev        # application sur http://localhost:5173
npm test           # tests du moteur d'analyse
npm run typecheck
npm run build
```

## Structure

| Dossier | Rôle |
| --- | --- |
| `apps/web` | Application React : écrans, carte, français et arabe |
| `apps/api` | API Node.js : comptes, offres, jeux de données, analyses PostGIS |
| `db/migrations` | Schéma PostgreSQL et PostGIS |
| `packages/analytics` | Moteur d'analyse et jeu de données DEMO |
| `e2e` | Parcours de contrôle dans un vrai navigateur |

L'application web fonctionne pour l'instant en mode DEMO, sans appeler l'API. Voir [`docs/API.md`](docs/API.md) et [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).

## Hébergement

GitHub Pages ne convient qu'à une démo : ses règles excluent l'exploitation d'un service SaaS, et l'envoi de mots de passe ou de numéros de carte. La version commerciale exigera un hébergement cloud.

Ne committez jamais de clé ni de secret : utilisez `.env`, ignoré par Git, sur le modèle de `.env.example`.
