# API TerriScope

Réponses en JSON. Erreurs : `{ "error": { "code", "message" } }`. Authentification : en-tête `Authorization: Bearer <jeton>`.

| Méthode et chemin | Rôle minimal | Objet |
| --- | --- | --- |
| `GET /health` | public | État de l'API et du routage |
| `GET /plans` | public | Offres et limites |
| `POST /auth/register` | public | Compte, organisation, essai Pro de 14 jours |
| `POST /auth/login` | public | Ouvre une session |
| `POST /auth/logout` | lecteur | Ferme la session |
| `GET /me` | lecteur | Compte, rôle et offre effective |
| `GET /datasets` | lecteur | Jeux de données de l'organisation |
| `POST /datasets` | analyste | Enregistre un jeu validé, selon l'offre |
| `DELETE /datasets/:id` | analyste | Supprime un jeu |
| `POST /analyses/coverage` | analyste | Couverture calculée par PostGIS |
| `POST /analyses/catchment` | analyste | Population et concurrents par rayon |
| `POST /analyses/isochrone` | analyste | Isochrones Valhalla ; 503 sans moteur |
| `GET /analyses/:id` | lecteur | Résultat, paramètres et version de méthode |

Codes notables : `401 unauthenticated`, `403 forbidden`, `402 plan_limit`, `404 not_found`, `429 rate_limited`, `503 router_unavailable`.

L'isolation repose sur la Row Level Security de PostgreSQL : l'API endosse le rôle `terriscope_app` et fixe `app.org_id` dans chaque transaction.
